import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { Linking, Platform } from 'react-native';

import * as api from '@/lib/api';
import type { Facture } from '@/types/domain';

/** Télécharge le PDF d'une facture puis l'ouvre (web) ou propose de le partager (mobile). */
export async function ouvrirFacture(facture: Facture): Promise<void> {
  const url = await api.urlFacturePdf(facture.id);
  const token = await api.getToken();

  if (Platform.OS === 'web') {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`Facture indisponible (${res.status})`);
    Linking.openURL(URL.createObjectURL(await res.blob()));
    return;
  }

  const destination = `${FileSystem.cacheDirectory}${facture.numero}.pdf`;
  const resultat = await FileSystem.downloadAsync(url, destination, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (resultat.status !== 200) throw new Error(`Facture indisponible (${resultat.status})`);
  await Sharing.shareAsync(destination, { mimeType: 'application/pdf' });
}
