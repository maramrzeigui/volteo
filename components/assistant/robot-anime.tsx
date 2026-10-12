import LottieView from 'lottie-react-native';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

/** Robot de l'assistant (animation Lottie aux couleurs de Volteo), purement décoratif. */
export function RobotAnime({ taille = 220 }: { taille?: number }) {
  const reduit = useReducedMotion();

  return (
    <View aria-hidden accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <LottieView
        source={require('@/assets/animations/assistant-robot.json')}
        autoPlay={!reduit}
        loop
        // Proportions de l'animation d'origine (682 × 902).
        style={{ width: taille, height: taille * (902 / 682) }}
      />
    </View>
  );
}
