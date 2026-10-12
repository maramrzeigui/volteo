import { StyleSheet, View } from 'react-native';

import { Texte } from '@/components/ui/texte';
import type { Palette } from '@/constants/theme';

/** Texte en arabe : affichage de droite à gauche. */
export const estArabe = (texte: string) => /[؀-ۿ]/.test(texte);

/** **gras** au sein d'une ligne. */
function Ligne({ texte, couleur, rtl }: { texte: string; couleur: keyof Palette | string; rtl: boolean }) {
  const morceaux = texte.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Texte variant="body" color={couleur} style={rtl ? styles.rtl : undefined} selectable>
      {morceaux.map((m, i) =>
        m.startsWith('**') && m.endsWith('**') ? (
          <Texte key={i} variant="bodyStrong" color={couleur}>
            {m.slice(2, -2)}
          </Texte>
        ) : (
          m
        ),
      )}
    </Texte>
  );
}

/**
 * Rendu léger des réponses de l'assistant : paragraphes, listes à puces (« - »)
 * et **gras**, de droite à gauche pour l'arabe.
 */
export function TexteRiche({ texte, couleur = 'text' }: { texte: string; couleur?: keyof Palette | string }) {
  const rtl = estArabe(texte);
  const blocs = texte.split(/\n{2,}/);

  return (
    <View style={styles.blocs}>
      {blocs.map((bloc, i) => {
        const lignes = bloc.split('\n');
        return (
          <View key={i} style={styles.lignes}>
            {lignes.map((l, j) => {
              const puce = /^\s*[-•*]\s+/.test(l);
              if (!puce) return <Ligne key={j} texte={l} couleur={couleur} rtl={rtl} />;
              return (
                <View key={j} style={[styles.puce, rtl && styles.puceRtl]}>
                  <View style={styles.marque} />
                  <View style={{ flex: 1 }}>
                    <Ligne texte={l.replace(/^\s*[-•*]\s+/, '')} couleur={couleur} rtl={rtl} />
                  </View>
                </View>
              );
            })}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  blocs: { gap: 10 },
  lignes: { gap: 4 },
  puce: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  puceRtl: { flexDirection: 'row-reverse' },
  marque: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E5545F', marginTop: 8 },
  rtl: { writingDirection: 'rtl', textAlign: 'right' },
});
