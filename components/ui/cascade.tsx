import { Children, type ReactNode } from 'react';
import Animated, { FadeInDown } from 'react-native-reanimated';

/** Fait apparaître chaque enfant en cascade (même rythme que les listes de l'app). */
export function Cascade({ children, delai = 0 }: { children: ReactNode; delai?: number }) {
  return (
    <>
      {Children.toArray(children).map((enfant, i) => (
        <Animated.View key={i} entering={FadeInDown.delay(delai + Math.min(i, 8) * 60).duration(450)}>
          {enfant}
        </Animated.View>
      ))}
    </>
  );
}
