# TF3 Lab

Un laboratoire open source pour comparer les trains de **Transport Fever 3**.
Cette preuve de concept reprend les paramètres et les mesures de la conversation
« Branche · Analyser Transport Fever 3 » du 5 octobre 2026 et recalcule les courbes.
Projet communautaire indépendant, sans affiliation avec l’éditeur du jeu.

## Explorer

- Distance en fonction du temps, vitesse en fonction du temps, temps en fonction de la distance.
- Quatre trains activables : Metroliner, RABe 502 Twindexx, TGV Duplex, Fuxing Hao.
- Curseur avec classement théorique, plusieurs horizons, observations vidéo superposées.
- Tables des transitions et des écarts mesuré − modèle ; export CSV et SVG.
- Interface française responsive, contrôles clavier et valeurs accessibles en tableau.

## Développer

Node.js 22 ou ultérieur, Python 3 pour le serveur local. Aucune installation npm nécessaire.

```sh
npm test
npm run build
npm run dev
```

Ouvrir <http://127.0.0.1:4173>. Le serveur expose uniquement la boucle locale.
Pour consulter le site depuis Windows lorsque le code tourne sur le Dell :

```powershell
ssh -N -L 4173:127.0.0.1:4173 flavien@flavien-g5-5590.tailbc92c5.ts.net
```

Puis ouvrir <http://127.0.0.1:4173> sur Windows. Arrêter le serveur et le tunnel
avec Ctrl+C. Le site nécessite HTTP pour charger les modules et le JSON ; ouvrir
`index.html` directement en `file://` ne suffit pas.

## Organisation

- `data/trains.json` : paramètres en unités du jeu, timestamps bruts, provenance et limites.
- `src/model.js` : modèle analytique pur, unités SI internes.
- `src/app.js` : interactions et tracé SVG, sans CDN ni bibliothèque externe.
- `tests/` : références numériques, transitions, inversion distance/temps et plafond.
- `scripts/build.mjs` : copie des seuls fichiers du site dans `dist/`.
- `.github/workflows/ci.yml` : tests et préparation du site, sans déploiement.

Pour ajouter un train, compléter le JSON avec un identifiant unique, les paramètres,
une couleur et un motif de trait distinct. Les valeurs physiques doivent être positives.
La sélection est locale à la page ; aucune collecte, connexion ou persistance utilisateur.

## Hypothèse physique et données

Depuis un départ arrêté, sur voie plane : `F(v) = min(Fmax, P/v)`, puis plafond `Vmax`.
Au départ, l’effort maximal évite la division par zéro. L’intégration des phases est
analytique ; l’inverse distance → temps l’est également. Conversions retenues :
1 kgf = 9,80665 N ; 1 ch = 735,5 W. Temps en secondes réelles depuis le départ.

Les paramètres ont été vérifiés sur les captures fournies. Les mesures utilisent
les timestamps vidéo moins 32 secondes. Le point Fuxing à environ 15 km / 247 s
reste approximatif ; ni précision des marqueurs ni vitesse vidéo ne sont certifiées.
Les images du jeu et le texte complet de la conversation ne sont pas redistribués.

Le modèle ne comprend ni résistance, pente, freinage, arrêts, ni composition variable.
L’accord avec quelques chronos ne prouve pas l’absence de traînée dans le jeu.
Des mesures répétées et des positions de marqueurs précises permettront de réexaminer
ces hypothèses. Certaines conclusions textuelles de la conversation étaient
contradictoires : les calculs et les mesures sont prioritaires sur ces commentaires.

## Hébergement

Le résultat `dist/` est un site statique autonome à chemins relatifs : il peut être
servi à la racine ou dans un sous-répertoire, sans réécriture d’URL ni secret.
L’hébergement n’est pas encore activé. La discussion et les preuves de livraison
se trouvent dans les [Issues](https://github.com/FlavienDrouot/transport-fever-3-lab/issues).

Pour GitHub Pages, après choix de cette option : préparer un workflow Actions
qui teste, génère `dist/`, téléverse un artefact Pages et le déploie avec les permissions
`pages: write` et `id-token: write` ; configurer Pages sur GitHub Actions.
Ne pas servir tout le dépôt comme artefact.

Pour OpenAI Sites, après choix de cette option : importer cette source via la compétence
Sites, enregistrer le Site, configurer son répertoire statique `dist` et publier une version.
Vérifier les droits de visite et les limites du compte à cette étape. Le manifeste
et les identifiants Sites ne sont pas précréés. Une synchronisation automatique GitHub →
Sites n’est pas présumée ; son flux devra être validé avant un double hébergement.

Garder GitHub comme source commune. Réexaminer l’hébergement si le projet nécessite
un serveur, des comptes, du stockage partagé ou des intégrations ChatGPT.

## Contribuer

Ouvrir une Issue pour discuter d’un nouveau modèle, d’un jeu de données ou d’une
évolution, puis une PR avec les validations pertinentes. Éviter d’ajouter des données
personnelles ou des captures sans droit de redistribution. Les conclusions scientifiques
doivent distinguer calculs, observations et incertitudes.

Code sous [licence MIT](LICENSE). Les noms du jeu et des trains restent ceux de leurs
ayants droit respectifs.
