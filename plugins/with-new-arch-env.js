/**
 * Plugin Expo : définit RCT_NEW_ARCH_ENABLED=1 dans le Podfile quand la nouvelle
 * architecture est active (newArchEnabled ≠ false).
 *
 * Le Podfile généré par Expo SDK 54 ne fixe cette variable que pour désactiver la
 * nouvelle architecture. Or certains podspecs (lottie-react-native 7) n'incluent
 * leur code Fabric que si elle vaut « 1 » : sans elle, le composant natif est absent
 * et l'app s'arrête au démarrage (RCTThirdPartyComponentsProvider → classe nil).
 */
const { withPodfile } = require('expo/config-plugins');

const MARQUEUR = '# BorneApp : RCT_NEW_ARCH_ENABLED pour les podspecs qui en dépendent';
const LIGNE = "ENV['RCT_NEW_ARCH_ENABLED'] ||= '1' if podfile_properties['newArchEnabled'] != 'false'";

module.exports = function withNewArchEnv(config) {
  return withPodfile(config, (cfg) => {
    const contenu = cfg.modResults.contents;
    if (!contenu.includes(MARQUEUR)) {
      const ancre = contenu.match(/^ENV\['RCT_NEW_ARCH_ENABLED'\].*$/m);
      if (!ancre) throw new Error('with-new-arch-env : ligne RCT_NEW_ARCH_ENABLED introuvable dans le Podfile');
      cfg.modResults.contents = contenu.replace(ancre[0], `${ancre[0]}\n${MARQUEUR}\n${LIGNE}`);
    }
    return cfg;
  });
};
