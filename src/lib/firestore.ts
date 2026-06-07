import { 
  collection, 
  addDoc, 
  updateDoc, 
  doc, 
  getDocs, 
  query, 
  where, 
  onSnapshot, 
  Timestamp,
  getDoc,
  setDoc,
  runTransaction,
  writeBatch,
  deleteDoc
} from 'firebase/firestore';
import { db, auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

function isAdminEmail(email: string | null | undefined) {
  return email === 'leoneldariogarcia@gmail.com' || email === 'jhbarber87@gmail.com' || email === 'puntobarba.barber@gmail.com';
}

export const BARBERS = [
  {
    id: 'ivan-nunez',
    name: 'Iván Núñez',
    photo: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&q=80&w=600',
    bio: 'Barbero de autor especialista en cortes clásicos y rituales de barba.',
    email: 'jhbarber87@gmail.com',
    role: 'admin'
  },
  {
    id: 'leonel-garcia',
    name: 'Leonel García',
    photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&q=80&w=600',
    bio: 'Administrador de Punto Barba',
    email: 'leoneldariogarcia@gmail.com',
    role: 'admin'
  }
];

export const SERVICES = [
  { id: 'corte', name: 'Corte de pelo', duration: 30, price: 18000 },
  { id: 'barba', name: 'Barba', duration: 30, price: 13000 },
  { id: 'corte-barba', name: 'Corte y Barba', duration: 60, price: 25000 }
];

export async function seedBarbers() {
  try {
    // Only attempt to seed/sync if the user is authenticated as the admin
    if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
      console.log('Skipping barber seeding: user not authenticated as admin.');
      return;
    }

    // Get all current barbers in Firestore
    const snapshot = await getDocs(collection(db, 'barbers'));
    
    // Delete any barber doc whose ID is NOT in our local BARBERS array
    const localIds = BARBERS.map(b => b.id);
    for (const docSnap of snapshot.docs) {
      if (!localIds.includes(docSnap.id)) {
        await deleteDoc(doc(db, 'barbers', docSnap.id));
        console.log(`Deleted old barber from DB: ${docSnap.id}`);
      }
    }

    // Write/Update local barbers
    for (const barber of BARBERS) {
      const barberRef = doc(db, 'barbers', barber.id);
      await setDoc(barberRef, barber, { merge: true });
    }
    console.log('Barbers seeded/synced successfully.');
  } catch (error) {
    if (error instanceof Error && error.message.includes('insufficient permissions')) {
      console.log('Insufficient permissions to seed barbers.');
    } else {
      console.error('Error seeding barbers:', error);
    }
  }
}

export async function clearAppointments() {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  
  try {
    const snapshot = await getDocs(collection(db, 'appointments'));
    const batch = writeBatch(db);
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    await batch.commit();
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'appointments');
  }
}

export async function addBarber(barber: any) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    const barberRef = doc(collection(db, 'barbers'));
    await setDoc(barberRef, { ...barber, id: barberRef.id });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'barbers');
  }
}

export async function deleteBarber(barberId: string) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    await deleteDoc(doc(db, 'barbers', barberId));
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'barbers');
  }
}

export async function updateBarber(barberId: string, data: any) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    const barberRef = doc(db, 'barbers', barberId);
    await updateDoc(barberRef, data);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'barbers');
  }
}

export async function updateBarbersData() {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }

  try {
    for (const barber of BARBERS) {
      const barberRef = doc(db, 'barbers', barber.id);
      await setDoc(barberRef, barber, { merge: true });
    }
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'barbers');
  }
}

export const DEFAULT_SCHEDULE = {
  0: { isOpen: false, start: '09:00', end: '19:00' },
  1: { isOpen: true, start: '09:00', end: '19:00' },
  2: { isOpen: true, start: '09:00', end: '19:00' },
  3: { isOpen: true, start: '09:00', end: '19:00' },
  4: { isOpen: true, start: '09:00', end: '19:00' },
  5: { isOpen: true, start: '09:00', end: '19:00' },
  6: { isOpen: true, start: '09:00', end: '17:00' }
};

export async function getShopSettings() {
  try {
    const settingsRef = doc(db, 'settings', 'shop');
    const snap = await getDoc(settingsRef);
    if (snap.exists()) {
      return snap.data();
    }
    return { schedule: DEFAULT_SCHEDULE };
  } catch (error) {
    console.error('Error fetching settings', error);
    return { schedule: DEFAULT_SCHEDULE };
  }
}

export async function updateShopSettings(data: any) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    const settingsRef = doc(db, 'settings', 'shop');
    await setDoc(settingsRef, data, { merge: true });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'settings');
  }
}

export const DEFAULT_PRODUCTS = [
  {
    id: 'cera-matte',
    name: 'Cera Matte Clay',
    desc: 'Fijación fuerte con acabado mate natural. Aporta textura y volumen sin dejar residuos.',
    price: '$12.000',
    img: 'https://images.unsplash.com/photo-1608248597279-f99d160bfcbc?auto=format&fit=crop&q=80&w=600',
    tag: '[ FIX ]'
  },
  {
    id: 'oleo-barba',
    name: 'Óleo Premium Barba',
    desc: 'Hidratación profunda para la piel y suavidad extrema para el vello facial con notas a madera noble.',
    price: '$9.500',
    img: 'https://images.unsplash.com/photo-1626015713026-d837d172406f?auto=format&fit=crop&q=80&w=600',
    tag: '[ HYDRATE ]'
  },
  {
    id: 'pomada-brillo',
    name: 'Pomada Pompadour',
    desc: 'Fijación media con acabado de brillo clásico húmedo, ideal para peinados formales y tradicionales.',
    price: '$11.000',
    img: 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?auto=format&fit=crop&q=80&w=600',
    tag: '[ SHINE ]'
  },
  {
    id: 'shampoo-purificante',
    name: 'Shampoo Carbón Activo',
    desc: 'Desintoxicación profunda del cuero cabelludo. Elimina impurezas y el exceso de oleosidad.',
    price: '$14.000',
    img: 'https://images.unsplash.com/photo-1535585209827-a15fcdbc4c2d?auto=format&fit=crop&q=80&w=600',
    tag: '[ DETOX ]'
  }
];

export async function addProduct(product: any) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    const productRef = doc(collection(db, 'products'));
    await setDoc(productRef, { ...product, id: productRef.id });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'products');
  }
}

export async function deleteProduct(productId: string) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    await deleteDoc(doc(db, 'products', productId));
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'products');
  }
}
