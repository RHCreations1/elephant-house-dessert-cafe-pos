const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { setGlobalOptions } = require('firebase-functions/v2');

// Keep callable functions close to the Firestore region selected for this project.
setGlobalOptions({ region: 'asia-south1' });
const { defineSecret } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue, FieldPath } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const crypto = require('crypto');

initializeApp();
const db = getFirestore();
const auth = getAuth();
const ADMIN_PIN = defineSecret('ADMIN_PIN');
const SUPERVISOR_PIN = defineSecret('SUPERVISOR_PIN');

function requireRole(request, allowed) {
  if (!request.auth) throw new HttpsError('unauthenticated', 'Please sign in first.');
  const role = request.auth.token.role || (request.auth.token.firebase?.sign_in_provider === 'anonymous' ? 'cashier' : 'none');
  if (!allowed.includes(role)) throw new HttpsError('permission-denied', 'Your account is not allowed to perform this action.');
  return role;
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

async function checkPinRateLimit(ip, role) {
  const key = crypto.createHash('sha256').update(`${ip || 'unknown'}:${role}`).digest('hex');
  const ref = db.collection('authPinAttempts').doc(key);
  const now = Date.now();
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : {};
    const active = data.windowStartedAt && now - data.windowStartedAt < 15 * 60 * 1000;
    const attempts = active ? Number(data.attempts || 0) : 0;
    if (attempts >= 5) throw new HttpsError('resource-exhausted', 'Too many attempts. Please wait 15 minutes and try again.');
    tx.set(ref, { attempts: attempts + 1, windowStartedAt: active ? data.windowStartedAt : now, updatedAt: FieldValue.serverTimestamp() });
  });
  return ref;
}

exports.loginWithRolePin = onCall({ secrets: [ADMIN_PIN, SUPERVISOR_PIN] }, async request => {
  const role = request.data?.role;
  if (!['admin', 'supervisor'].includes(role)) throw new HttpsError('invalid-argument', 'Choose Admin or Supervisor.');
  const pin = String(request.data?.pin || '');
  if (!/^\d{4,12}$/.test(pin)) throw new HttpsError('invalid-argument', 'Enter a valid numeric PIN.');
  const attemptsRef = await checkPinRateLimit(request.rawRequest?.ip, role);
  const expected = role === 'admin' ? ADMIN_PIN.value() : SUPERVISOR_PIN.value();
  if (!safeEqual(pin, expected)) throw new HttpsError('permission-denied', 'Incorrect PIN.');
  await attemptsRef.delete();

  const uid = role === 'admin' ? 'ehpos_admin' : 'ehpos_supervisor';
  try {
    await auth.getUser(uid);
  } catch (e) {
    if (e.code !== 'auth/user-not-found') throw e;
    await auth.createUser({ uid, displayName: role === 'admin' ? 'Elephant House Admin' : 'Elephant House Supervisor', disabled: false });
  }
  await auth.setCustomUserClaims(uid, { role });
  const token = await auth.createCustomToken(uid, { role });
  return { token, role };
});

async function readAll(path) {
  const out = [];
  let last = null;
  while (true) {
    let q = db.collection(path).orderBy(FieldPath.documentId()).limit(400);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    if (snap.empty) break;
    out.push(...snap.docs);
    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 400) break;
  }
  return out;
}

async function writeBackupDocs(backupId, sourceName, docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(doc => {
      batch.set(db.collection('maintenanceBackups').doc(backupId).collection(sourceName).doc(doc.id), {
        originalId: doc.id, data: doc.data(), backedUpAt: FieldValue.serverTimestamp()
      });
    });
    await batch.commit();
  }
}

async function deleteDocs(docs) {
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db.batch();
    docs.slice(i, i + 400).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }
}

exports.adminClearSalesAndStock = onCall({ timeoutSeconds: 540, memory: '1GiB' }, async request => {
  const actorRole = requireRole(request, ['admin']);
  if (request.data?.confirmation !== 'CLEAR SALES + STOCK') {
    throw new HttpsError('failed-precondition', 'Confirmation phrase did not match.');
  }
  const backupId = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
  const sales = await readAll('sales');
  const stock = await readAll('stock');
  const metaRef = db.collection('maintenanceBackups').doc(backupId);
  await metaRef.set({
    type: 'sales-stock-clear', status: 'backup-in-progress',
    createdAt: FieldValue.serverTimestamp(), createdBy: request.auth.uid,
    actorRole, salesCount: sales.length, stockCount: stock.length
  });
  // Source records are untouched unless every backup write succeeds.
  await writeBackupDocs(backupId, 'sales', sales);
  await writeBackupDocs(backupId, 'stock', stock);
  await metaRef.update({ status: 'backup-complete', backupCompletedAt: FieldValue.serverTimestamp() });
  await deleteDocs(sales);
  await deleteDocs(stock);
  await metaRef.update({ status: 'completed', clearedAt: FieldValue.serverTimestamp() });
  await db.collection('auditLogs').add({
    action: 'clear-sales-stock', backupId, salesDeleted: sales.length,
    stockDeleted: stock.length, actorUid: request.auth.uid,
    actorRole, createdAt: FieldValue.serverTimestamp()
  });
  return { backupId, salesDeleted: sales.length, stockDeleted: stock.length };
});

exports.deleteBill = onCall(async request => {
  const actorRole = requireRole(request, ['supervisor', 'admin']);
  const billId = String(request.data?.billId || '');
  if (!billId || billId.includes('/')) throw new HttpsError('invalid-argument', 'A valid bill ID is required.');
  const ref = db.collection('sales').doc(billId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Bill not found.');
  const batch = db.batch();
  batch.set(db.collection('auditLogs').doc(), {
    action: 'delete-bill', billId, billNo: request.data?.billNo || snap.data().no || '',
    before: snap.data(), actorUid: request.auth.uid, actorRole,
    createdAt: FieldValue.serverTimestamp()
  });
  batch.delete(ref);
  await batch.commit();
  return { deleted: true };
});
