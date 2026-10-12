import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { QrCode } from '@/components/ui/qr-code';
import { SurfaceEncre } from '@/components/ui/surface-encre';
import { Texte } from '@/components/ui/texte';
import { Cascade } from '@/components/ui/cascade';
import { Espace, Rayons } from '@/constants/theme';
import { useAuth } from '@/contexts/auth-context';
import { useTheme } from '@/hooks/use-theme';

/** Module 6 — QR code d'identification du client (agence, borne équipée d'un lecteur). */
export default function QrScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { utilisateur } = useAuth();

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={[styles.contenu, { paddingBottom: insets.bottom + Espace.xxl }]}>
      <Cascade>
        <SurfaceEncre style={styles.carte}>
          <Texte variant="label" color="electric">
            Carte Volteo
          </Texte>
          <Texte variant="title" color="onInk" align="center">
            {utilisateur?.prenom} {utilisateur?.nom}
          </Texte>
          <View style={styles.qr}>
            {utilisateur?.qrToken ? (
              <QrCode valeur={`borneapp://user/${utilisateur.qrToken}`} taille={230} />
            ) : (
              <Texte variant="body" color="textMuted" align="center">
                QR code indisponible : reconnectez-vous pour le générer.
              </Texte>
            )}
          </View>
          <Texte variant="caption" color="onInkMuted" align="center">
            {utilisateur?.email}
          </Texte>
        </SurfaceEncre>

        <View style={styles.aide}>
          <Texte variant="subheading">À quoi sert-il ?</Texte>
          <Texte variant="body" color="textMuted">
            Présentez-le en agence ou au service client pour être identifié sans badge. Il est personnel : en cas de
            doute, le service client peut le régénérer et l’ancien ne sera plus reconnu.
          </Texte>
        </View>
      </Cascade>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  contenu: { padding: Espace.xl, gap: Espace.xl },
  carte: { borderRadius: Rayons.xl, padding: Espace.xl, gap: Espace.md, alignItems: 'center' },
  qr: { backgroundColor: '#FFFFFF', borderRadius: Rayons.lg, padding: Espace.md, marginVertical: Espace.sm },
  aide: { gap: Espace.sm },
});
