# TF3 Lab

Un laboratoire open source pour comparer les trains de **Transport Fever 3**.

**[Ouvrir le site](https://flaviendrouot.github.io/transport-fever-3-lab/)**
Ce site s’inspire de la vidéo de **[Flowengineer](https://www.youtube.com/@Flowengineer)**,
**[I Raced Every Multiple Unit in Transport Fever 3! Which one is the best?](https://www.youtube.com/watch?v=KgUHw9Ya60M)**.
Les chronos de cette vidéo ont servi à la validation initiale du modèle, avec les
paramètres relevés sur les captures du jeu et discutés le 5 octobre 2026.
Les graphes et exports présentent maintenant uniquement les courbes théoriques.
Projet communautaire indépendant, sans affiliation avec l’éditeur du jeu.

## Explorer

- Distance en fonction du temps, vitesse en fonction du temps, temps en fonction de la distance.
- Quatre trains activables : Metroliner, RABe 502 Twindexx, TGV Duplex, Fuxing Hao.
- Catalogue compact défilant avec recherche par nom/année, tri et sélection des résultats.
- Curseur avec classement théorique et plusieurs horizons ; identification des courbes au survol ou au focus clavier.
- Échelles linéaires ou logarithmiques indépendantes pour chaque axe.
- Table des transitions ; exports CSV et SVG des courbes théoriques.
- Interface en anglais responsive, contrôles clavier et valeurs accessibles en tableau.

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

## Aperçu privé depuis un autre poste

Dans Codex, lancer l’action **Aperçu** définie dans
[`.codex/environments/environment.toml`](.codex/environments/environment.toml),
ou exécuter `npm run dev:remote` depuis le checkout.
Le terminal affiche une URL HTTPS Tailscale avec le port sélectionné.
Ouvrir ce lien dans le navigateur du poste Windows connecté au même réseau Tailscale.
Aucun tunnel SSH supplémentaire n’est nécessaire pour cette action.

Le serveur reste sur `127.0.0.1` sur le Dell ; Tailscale Serve relaie uniquement
les fichiers publics du site. Le port est choisi à partir de 8443 selon les disponibilités,
pour permettre plusieurs aperçus sans modifier les routes existantes. Les modifications
non commitées du checkout apparaissent après rafraîchissement du navigateur ;
il n’y a pas de rechargement automatique.

Garder le terminal ouvert. Ctrl+C ou une terminaison normale arrête le serveur et
sa session Serve. Une interruption forcée peut laisser le processus enfant actif :
arrêter uniquement le `tailscale serve` de cet aperçu, sans `tailscale serve reset`.
Prérequis : Node.js, Tailscale CLI connecté, MagicDNS/certificats HTTPS actifs,
droits Serve sur le Dell et accès au port dans les règles du réseau Tailscale.
Le lanceur ne modifie ni ces droits, ni le pare-feu, et n’utilise pas Funnel.
En cas d’échec, consulter `tailscale status`, `tailscale serve status` et le message
du terminal. Le tunnel SSH décrit plus haut reste une alternative avec `npm run dev`.

## Organisation

- `data/trains.json` : paramètres en unités du jeu, timestamps bruts, provenance et limites.
- `src/model.js` : modèle analytique pur, unités SI internes.
- `src/scales.js` : transformations linéaires/logarithmiques et graduations.
- `src/app.js` : interactions et tracé SVG, sans CDN ni bibliothèque externe.
- `tests/` : références numériques, transitions, inversion distance/temps et plafond.
- `scripts/build.mjs` : copie des seuls fichiers du site dans `dist/`.
- `.github/workflows/ci.yml` : tests, préparation du site et publication sur GitHub Pages.

Pour ajouter un train, compléter le JSON avec un identifiant unique, les paramètres,
une couleur et un motif de trait distinct. Les valeurs physiques doivent être positives.
La sélection est locale à la page ; aucune collecte, connexion ou persistance utilisateur.

## Catalogue et échelles

L’interface reprend la structure de la capture Slopalytics fournie : navigation des
vues en haut, graphe central et catalogue à droite. Sur mobile, le catalogue compact
précède le graphe. La recherche filtre uniquement la liste, sans modifier la sélection ;
« Select results » et « Clear results » agissent sur les résultats filtrés.
Au lancement et avec « Reset », les quatre premières entrées du JSON sont sélectionnées.
Toutes les séries sélectionnées sont tracées. Jusqu’à douze séries, leurs noms sont
placés en fin de courbe ; au-delà, le survol/focus d’une ligne du catalogue identifie
une série et atténue les autres pour limiter la superposition des noms.

Le mode Log utilise un logarithme en base 10, avec graduations en unités physiques.
Zéro n’a pas de position logarithmique : il reste dans le classement et dans le CSV.
Les limites positives sont affichées : X à 1 s ou 0,01 km selon la vue ; Y à
0,001 km, 1 km/h ou 1 s. Le changement d’échelle ne change ni le modèle ni les
valeurs exportées en CSV. Le SVG conserve les échelles choisies et une légende complète.
L’échantillonnage des courbes tient compte des échelles pour résoudre le démarrage.
La ligne de Pareto n’est pas implémentée.

Le catalogue fourni contient toujours les quatre trains vérifiés. L’interface est
validée avec une fixture de 80 trains sans publier de faux paramètres. La liste n’est
pas virtualisée ; envisager cette optimisation seulement si un catalogue réel beaucoup
plus grand présente des lenteurs mesurées.

## Hypothèse physique et données

Depuis un départ arrêté, sur voie plane : `F(v) = min(Fmax, P/v)`, puis plafond `Vmax`.
Au départ, l’effort maximal évite la division par zéro. L’intégration des phases est
analytique ; l’inverse distance → temps l’est également. Conversions retenues :
1 kgf = 9,80665 N ; 1 ch = 735,5 W. La puissance est affichée en PS (chevaux métriques)
sur le site anglais, sans conversion vers les horsepower impériaux. Temps en secondes
réelles depuis le départ.

Les paramètres ont été vérifiés sur les captures fournies. Les mesures sont conservées
dans le JSON comme provenance de la validation initiale ; elles ne sont plus affichées
dans les graphes, les tableaux ou les exports du site. Les mesures utilisent
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
GitHub Pages est configuré avec GitHub Actions. La discussion et les preuves de livraison
se trouvent dans les [Issues](https://github.com/FlavienDrouot/transport-fever-3-lab/issues).

Le workflow `.github/workflows/ci.yml` exécute les tests et le build sur les PR.
Chaque push sur `main` publie `dist/` après réussite des tests ; le déclenchement
manuel `workflow_dispatch` sur `main` permet de republier. Les PR ne déploient pas.
La source Pages du dépôt est **GitHub Actions** ; le job de publication utilise
l’environnement `github-pages` et les permissions `pages: write` / `id-token: write`.
Seuls les fichiers du site sont téléversés. Les URL utilisent le sous-répertoire
`/transport-fever-3-lab/` grâce aux chemins relatifs.

En cas d’échec, consulter le run Actions : vérifier d’abord tests/build, puis
les réglages Pages et l’environnement `github-pages`. Pour revenir à une version
antérieure, rétablir le commit voulu sur `main` avec un revert revu et pousser.
Ne pas relancer une ancienne exécution concurrente pour contourner l’historique.

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
