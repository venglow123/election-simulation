# Simulateur de reports de voix – élections présidentielles (2 tours)

[![CI](https://github.com/venglow123/election-simulation/actions/workflows/ci.yml/badge.svg)](https://github.com/venglow123/election-simulation/actions/workflows/ci.yml)
[![Deploy GitHub Pages](https://github.com/venglow123/election-simulation/actions/workflows/deploy-pages.yml/badge.svg)](https://github.com/venglow123/election-simulation/actions/workflows/deploy-pages.yml)

Application web 100 % statique (React + Vite, sans backend) permettant de créer
et gérer des simulations d'élections à scrutin uninominal à 2 tours (type
élection présidentielle française) : résultats du 1er tour, matrice de reports
de voix, calcul automatique du 2e tour et visualisation des flux via un
diagramme de Sankey.

Les données sont stockées **uniquement dans le navigateur** de l'utilisateur
(`localStorage`, clé `election-simulation:v2`). Au premier accès, les données
de `election-simulation:v1` sont migrées localement vers une élection existante;
la clé v1 est conservée. Aucun serveur applicatif : l'application est publiée
sur GitHub Pages.

> Trade-offs : les scénarios ne sont pas synchronisés entre navigateurs ou
> appareils, et sont perdus si l'utilisateur vide les données du site. Utiliser
> le partage d'élection (lien, QR code ou fichier) pour les transférer.

## Fonctionnalités

- Créer, dupliquer et supprimer des simulations
- Créer plusieurs élections et regrouper les simulations dans des workspaces
- Gérer le référentiel de candidats et partis de chaque élection
- Naviguer entre élections et simulations
- Afficher les tags des hypothèses sous les titres des deux sections d'un
  scénario. En mode Custom, sélectionner, créer ou retirer les tags avec le
  même sélecteur que dans l'éditeur d'hypothèses; les tags des hypothèses liées
  restent en lecture seule. Le passage en Custom conserve leurs tags, et les
  tags personnalisés suivent la duplication, l'enregistrement comme hypothèse
  et le partage de l'élection.
- Faire varier le nombre d'inscrits et l'abstention du 1er tour
- Saisir les résultats du 1er tour (candidat, pourcentage) dans un tableau
  éditable façon tableur (navigation au clavier, ajout de ligne à la volée,
  sauvegarde automatique sans bouton)
- Définir une matrice de reports de voix (par candidat et par abstentionniste
  du 1er tour : % vers chacun des 2 finalistes). L'abstention au 2e tour se
  calcule automatiquement (100% - les 2 reports saisis)
- Calcul automatique des résultats du 2e tour (voix, %, vainqueur, abstention),
  mis à jour en direct à chaque modification
- Diagramme de Sankey (SVG, sans dépendance externe) pour visualiser les flux
  de voix du 1er vers le 2e tour, y compris les abstentionnistes qui se
  remobilisent au 2e tour
- Partage d'une élection entière (candidats, tags, hypothèses de 1er tour et de
  report, scénarios) via un lien, un QR code (petites élections) ou un fichier
  `.json`
- Import d'une élection depuis un lien, un fichier exporté ou une image
  contenant un QR code, avec validation côté navigateur

## Fonctionnalités à venir

- Gestion des sources : sondages, résultats d'élections précédentes et
  reports de voix

> Seul le scrutin uninominal majoritaire à 2 tours est géré. Les 2 finalistes
> du 2e tour sont automatiquement les 2 candidats ayant obtenu le plus de voix
> au 1er tour. La victoire dès le premier tour n'est pas prise en compte : le 2e tour est toujours calculé.

## Prérequis (développement local)

- Soit [Docker](https://www.docker.com/) et Docker Compose,
- soit Node.js 20+.

## Bibliothèques utilisées

| Bibliothèque | Version déclarée | Usage |
| --- | --- | --- |
| React | ^18.3.1 | Construction de l'interface utilisateur |
| React DOM | ^18.3.1 | Rendu React dans le navigateur |
| React Router DOM | ^7.18.4 | Navigation entre les vues de l'application |
| Vite | ^8.3.1 | Serveur de développement et build du frontend |
| @vitejs/plugin-react | ^5.2.0 | Intégration de React dans Vite |
| qrcode | ^1.5.4 | Génération du QR code dans l'image de partage |
| jsqr | ^1.4.0 | Lecture des QR codes depuis les images importées |
| fflate | ^0.8.2 | Compression du payload avant encodage QR |

## Démarrage rapide

```powershell
docker compose up --build
```

Puis ouvrir : http://localhost:5000

L'image Docker compile le frontend (tests inclus) puis sert les fichiers
statiques via nginx. Aucune donnée n'est stockée côté conteneur : tout est
dans le `localStorage` du navigateur.

Pour arrêter : `Ctrl+C`, puis (optionnel) `docker compose down`.

### Réinitialiser les données

Dans le navigateur : outils de développement → Application → Local Storage →
supprimer les clés `election-simulation:v2` et `election-simulation:v1` (ou
effacer les données du site). La clé v1 n'est conservée que pour rendre la
migration récupérable; les écritures ultérieures sont faites en v2.

## Déploiement sur GitHub Pages

Le workflow `.github/workflows/deploy-pages.yml` teste, build et publie
`frontend/dist` lorsqu'un tag de version `v*` est poussé. Un push ou un merge
sur `main` ne déploie pas l'application; il continue seulement d'exécuter la CI.

Activation (une seule fois) : **Settings → Pages → Build and deployment →
Source : GitHub Actions**.

Le build utilise des chemins relatifs (`base: "./"`) et un routage par hash
(`#/elections/1/simulations/1`), ce qui fonctionne sous `https://<user>.github.io/<repo>/`
sans configuration supplémentaire.

### Publier une version

Utiliser un numéro [SemVer](https://semver.org/lang/fr/) préfixé par `v`, puis
pousser le tag :

```powershell
git tag -a v1.1.0 -m "Version 1.1.0"
git push origin v1.1.0
```

Le tag est injecté dans le build et affiché en bas de la barre latérale. Après
le déploiement, le workflow crée une GitHub Release **en brouillon** et génère
les notes depuis les pull requests fusionnées depuis la version précédente.
Dans l'onglet **Releases** du dépôt, compléter le résumé ou les instructions
utiles, vérifier les notes générées, puis cliquer sur **Publish release**.

Pour obtenir des notes lisibles, donner aux pull requests un titre orienté
utilisateur, par exemple « Ajouter l'import d'un scénario depuis un QR code »
ou « Corriger le calcul de l'abstention au second tour », et un de ces labels :
`feature` ou `enhancement`, `bug` ou `fix`, `maintenance`, `dependencies` ou
`documentation`. Le label `skip-changelog` exclut une pull request des notes.


## Utilisation

1. Depuis le panneau de gauche, créer une élection (workspace), puis un scénario
  (ex. « Présidentielle 2027 – scénario A »).
2. Dans la configuration de l'élection, gérer le référentiel de candidats et
  leurs partis. Leurs noms sont suggérés dans tous les scénarios du workspace.
3. Dans la simulation :
   - Renseigner le nombre d'inscrits et l'abstention du 1er tour.
  - Ajouter les candidats du 1er tour (nom, % de voix); leur parti est géré dans le référentiel de l'élection.
   - Renseigner, pour chaque candidat, la répartition de ses voix au 2e tour
     (% vers chacun des 2 finalistes + % d'abstention). Chaque ligne doit
     idéalement totaliser 100 %.
   - Consulter les résultats calculés du 2e tour et le diagramme de Sankey.
4. Depuis la liste des simulations, dupliquer une simulation permet de créer
   rapidement une variante (autre hypothèse de reports de voix, autre niveau
   d'abstention, etc.).
5. Pour partager une élection, cliquer sur **Partager l'élection** sous la
  liste déroulante des élections dans la barre latérale : copier le lien
  (`https://<baseUrl>/#/import?content=...`), télécharger le QR code (quand
  l'élection est assez compacte) ou le fichier `.json`.
6. Le destinataire ouvre le lien (ou utilise **Importer** dans la barre
  latérale en collant le lien, en fournissant le fichier ou l'image du QR
  code) puis confirme l'import : une nouvelle élection indépendante est créée.

Des avertissements s'affichent si la somme des pourcentages du 1er tour ou
d'une ligne de la matrice de reports ne fait pas 100 %, mais cela n'empêche
pas le calcul (utile pour explorer des scénarios en cours de saisie).

## Structure du projet

```
frontend/
  src/
    App.jsx                    # Routes workspaces (react-router, HashRouter)
    api.js                     # Façade publique stable des opérations locales
    api/storage.js             # Persistance localStorage, migration v1 vers v2
    api/model.js               # Helpers de création, recherche et synchronisation
    api/elections.js           # Élections, référentiel de candidats, export/import
    api/hypotheses.js          # Hypothèses et candidats du premier tour
    api/simulations.js         # Scénarios et reports de voix
    styles.css                 # Point d'entrée ordonné des feuilles CSS
    styles/                    # Base, layout, contrôles, résultats et vues métier
    context/SimulationsContext.jsx  # Élections et scénarios actifs partagés
    hooks/useGridNavigation.js # Navigation clavier façon tableur dans les tableaux éditables
    components/EditableTable.jsx # Enveloppe configurable partagée par les tableaux éditables
    utils/simulationEngine.js  # Calcul du 2e tour + données du Sankey + sérialisation
    utils/debounceByKey.js     # Auto-sauvegarde différée par champ (sans bouton "Enregistrer")
    utils/electionExchange.js  # Contrat versionné, compression et validation du partage d'élection
    components/                # Sidebar, modales partage/import, tableaux, résultats, Sankey (SVG)
  vite.config.js    # Dev server + build statique (base relative)
Dockerfile          # Multi-stage : build Node du frontend, puis nginx statique
docker-compose.yml
```

Les feuilles CSS restent globales : les sélecteurs sont partagés par plusieurs
composants. Leur ordre est conservé dans `styles.css` pour préserver la cascade.
Les composants continuent d'importer `api.js`; les détails de stockage et les
opérations par domaine sont internes à `api/`.

## Développement local avec rechargement à chaud

```powershell
cd frontend
npm install
npm run dev
```

Ouvrir http://localhost:5173.

## Tests unitaires

Les calculs de voix, les reports de voix, la remobilisation des abstentionnistes
et la cohérence des flux Sankey sont couverts par le test runner natif de Node :

```powershell
cd frontend
npm test
```

## Intégration continue

GitHub Actions exécute automatiquement, sur chaque push vers `main`
et sur chaque pull request :

- les tests unitaires et le build du frontend ;
- le build de l'image Docker après réussite du contrôle précédent.

La workflow est définie dans `.github/workflows/ci.yml` ; le déploiement dans
`.github/workflows/deploy-pages.yml`.

## Limites connues

- Données locales au navigateur : pas de synchronisation entre appareils, perte
  en cas d'effacement des données du site.
- Un seul type de scrutin est géré (uninominal majoritaire à 2 tours).
- La victoire au 1er tour n'est pas prise en compte : le 2e tour est toujours calculé.
- Le diagramme de Sankey est un composant React/SVG fait maison (pas de
  bibliothèque de graphes externe), suffisant pour visualiser les flux de
  voix sans dépendance réseau supplémentaire au runtime.

