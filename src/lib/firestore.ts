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
  return email === 'leoneldariogarcia@gmail.com' || email === 'puntobarba.barber@gmail.com' || email === 'puntobarbabarberia@gmail.com';
}

export const BARBERS = [
  {
    id: 'ivan-nunez',
    name: 'Iván Núñez',
    photo: 'https://images.unsplash.com/photo-1517832606299-7ae9b720a186?auto=format&fit=crop&q=80&w=600',
    bio: 'Barbero de autor especialista en cortes clásicos y rituales de barba.',
    email: 'puntobarbabarberia@gmail.com',
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
  { id: 'corte-cabello', name: 'Corte de cabello', duration: 60, price: 20000 },
  { id: 'corte-tijera', name: 'Corte con tijera', duration: 60, price: 25000 },
  { id: 'barba-express', name: 'Barba express', duration: 30, price: 15000 },
  { id: 'barba-moderna', name: 'Barba Moderna', duration: 30, price: 20000 },
  { id: 'afeitado-clasico', name: 'Afeitado Clásico', duration: 30, price: 30000 },
  { id: 'ritual-facial', name: 'Ritual facial', duration: 30, price: 25000 },
  { id: 'corte-perfilado-cejas', name: 'Corte + Perfilado de cejas', duration: 60, price: 24000 },
  { id: 'corte-b-express', name: 'Corte + B. Express', duration: 60, price: 28000 },
  { id: 'corte-b-moderna', name: 'Corte + B. Moderna', duration: 60, price: 32000 },
  { id: 'corte-a-clasico', name: 'Corte + A. Clásico', duration: 60, price: 40000 },
  { id: 'corte-r-facial', name: 'Corte + R. Facial', duration: 60, price: 36000 },
  { id: 'servicio-vip', name: 'Servicio VIP', duration: 240, price: 200000 }
];

export async function seedServices() {
  try {
    if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
      console.log('Skipping services seeding: user not authenticated as admin.');
      return;
    }

    const settingsRef = doc(db, 'settings', 'shop');
    const snap = await getDoc(settingsRef);
    if (!snap.exists() || !snap.data()?.services) {
      await setDoc(settingsRef, { services: SERVICES }, { merge: true });
      console.log('Services seeded successfully in Firestore (was empty/missing).');
    }
  } catch (error) {
    console.error('Error seeding services:', error);
  }
}


export async function seedBarbers() {
  try {
    // Only attempt to seed/sync if the user is authenticated as the admin
    if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
      console.log('Skipping barber seeding: user not authenticated as admin.');
      return;
    }

    // Get all current barbers in Firestore
    const snapshot = await getDocs(collection(db, 'barbers'));
    
    // Only seed if there are no barbers in the database
    if (snapshot.empty) {
      for (const barber of BARBERS) {
        const barberRef = doc(db, 'barbers', barber.id);
        await setDoc(barberRef, barber);
      }
      console.log('Barbers seeded successfully (DB was empty).');
    } else {
      console.log('Skipping barber seeding: database already has barbers.');
    }
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
    const slotsSnapshot = await getDocs(collection(db, 'slots'));
    const batch = writeBatch(db);
    
    snapshot.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });
    slotsSnapshot.docs.forEach((doc) => {
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

export async function updateProduct(productId: string, data: any) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    const productRef = doc(db, 'products', productId);
    await updateDoc(productRef, data);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'products');
  }
}

export const DEFAULT_DRINKS = [
  { name: 'Café', category: 'cafeteria', available: true },
  { name: 'Cortado', category: 'cafeteria', available: true },
  { name: 'Capuchino', category: 'cafeteria', available: true },
  { name: 'Corona', category: 'alcohol', available: true },
  { name: 'Whisky', category: 'alcohol', available: true },
  { name: 'Licor de crema', category: 'alcohol', available: true }
];

export async function addDrink(drink: any) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    const drinkRef = doc(collection(db, 'drinks'));
    await setDoc(drinkRef, { ...drink, id: drinkRef.id });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'drinks');
  }
}

export async function updateDrink(drinkId: string, data: any) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    const drinkRef = doc(db, 'drinks', drinkId);
    await updateDoc(drinkRef, data);
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'drinks');
  }
}

export async function deleteDrink(drinkId: string) {
  if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
    throw new Error('No tienes permisos para realizar esta acción.');
  }
  try {
    await deleteDoc(doc(db, 'drinks', drinkId));
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'drinks');
  }
}

export async function seedDrinks() {
  try {
    if (!auth.currentUser || !isAdminEmail(auth.currentUser.email)) {
      console.log('Skipping drinks seeding: user not authenticated as admin.');
      return;
    }

    const snapshot = await getDocs(collection(db, 'drinks'));
    if (snapshot.empty) {
      const batch = writeBatch(db);
      DEFAULT_DRINKS.forEach(drink => {
        const drinkRef = doc(collection(db, 'drinks'));
        batch.set(drinkRef, { ...drink, id: drinkRef.id });
      });
      await batch.commit();
      console.log('Drinks seeded successfully (DB was empty).');
    }
  } catch (error) {
    console.error('Error seeding drinks:', error);
  }
}
