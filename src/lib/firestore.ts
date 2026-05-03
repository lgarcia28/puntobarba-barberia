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
  return email === 'leoneldariogarcia@gmail.com' || email === 'jhbarber87@gmail.com' || email === 'resetart.barber@gmail.com';
}

export const BARBERS = [
  {
    id: 'jose-hernandez',
    name: 'José Hernández',
    photo: 'https://i.postimg.cc/kgZpvN3v/321c5b1d-a0bc-4435-ba08-c39b44025586.jpg',
    bio: '',
    email: 'resetart.barber@gmail.com',
    role: 'admin'
  },
  {
    id: 'fabricio-lozano',
    name: 'Fabricio Lozano',
    photo: 'https://i.postimg.cc/VNNHZb2R/438b49d7-3dbd-45ff-a274-4c0c7c495738.jpg',
    bio: '',
    email: 'fabricio@resetart.com',
    role: 'barber'
  },
  {
    id: 'mateo-montenegro',
    name: 'Mateo Montenegro',
    photo: 'https://i.postimg.cc/02dW8fsf/51361ed6-8bd2-43b9-9373-8c912e1b0afd.jpg',
    bio: '',
    email: 'mateo@resetart.com',
    role: 'barber'
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
