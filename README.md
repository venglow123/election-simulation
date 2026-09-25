# Simulateur de reports de voix – élections présidentielles (2 tours)

[![CI](https://github.com/venglow123/election-simulation/actions/workflows/ci.yml/badge.svg)](https://github.com/venglow123/election-simulation/actions/workflows/ci.yml)

Application web (React + API JSON Flask, SQLite) permettant de créer et gérer
des simulations d'élections à scrutin uninominal à 2 tours (type élection
présidentielle française) : résultats du 1er tour, matrice de reports de voix,
calcul automatique du 2e tour et visualisation des flux via un diagramme de
Sankey.

## Fonctionnalités

- Créer, dupliquer et supprimer des simulations
- Naviguer entre les différentes simulations
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
- Export d'un scénario en image PNG carrée contenant uniquement le code de
  partage
- Import d'un scénario depuis une image contenant un QR code, par fichier ou
  presse-papiers, avec validation côté navigateur et côté API

## Fonctionnalités à venir

- Gestion des élections
- Groupement des simulations par élection
- Gestion des sources : sondages, résultats d'élections précédentes et
  reports de voix

> Seul le scrutin uninominal majoritaire à 2 tours est géré. Les 2 finalistes
> du 2e tour sont automatiquement les 2 candidats ayant obtenu le plus de voix
> au 1er tour. La victoire dès le premier tour n'est pas prise en compte : le 2e tour est toujours calculé.

## Prérequis

- [Docker](https://www.docker.com/) et Docker Compose (inclus dans Docker
  Desktop, ou plugin `docker compose` sous Linux)

Aucune installation de Node.js ou de Python n'est nécessaire sur le poste pour
faire tourner l'application : le build du frontend React et l'exécution de
l'API Flask se font entièrement dans les conteneurs Docker.

## Bibliothèques utilisées

### Backend

| Bibliothèque | Version | Usage |
| --- | --- | --- |
| Flask | 3.0.3 | API JSON et serveur de l'application |
| Flask-SQLAlchemy | 3.1.1 | Accès à la base SQLite via SQLAlchemy |
| Gunicorn | 22.0.0 | Serveur WSGI de production localisé dans le conteneur |

### Frontend

| Bibliothèque | Version déclarée | Usage |
| --- | --- | --- |
| React | ^18.3.1 | Construction de l'interface utilisateur |
| React DOM | ^18.3.1 | Rendu React dans le navigateur |
| React Router DOM | ^6.26.2 | Navigation entre les vues de l'application |
| Vite | ^5.4.8 | Serveur de développement et build du frontend |
| @vitejs/plugin-react | ^4.3.1 | Intégration de React dans Vite |
| qrcode | ^1.5.4 | Génération du QR code dans l'image de partage |
| jsqr | ^1.4.0 | Lecture des QR codes depuis les images importées |
| fflate | ^0.8.2 | Compression du payload avant encodage QR |

## Démarrage rapide

```powershell
docker compose up --build
```

Puis ouvrir : http://localhost:5000

Le premier build télécharge les dépendances Node (frontend) et Python
(backend) puis compile le frontend React en assets statiques servis par
Flask. Cela peut prendre une minute ou deux. Les builds suivants sont plus
rapides grâce au cache Docker.

Pour arrêter : `Ctrl+C`, puis (optionnel) `docker compose down`.

Les données sont stockées dans une base SQLite persistée dans un **volume
Docker nommé** (`db-data`, déclaré dans `docker-compose.yml`), indépendant du
cycle de vie des conteneurs. Elles survivent donc à `docker compose down`,
aux redémarrages, reconstructions (`--build`) et mises à jour de l'image.

> Un volume Docker nommé est utilisé plutôt qu'un dossier monté (`./data`)
> pour éviter les problèmes de verrouillage de fichier SQLite parfois
> observés avec les montages bind sur Docker Desktop (Windows/Mac), et pour
> ne pas risquer de perdre les données si le dossier `./data` est supprimé ou
> déplacé par erreur sur l'hôte.

### Réinitialiser les données

```powershell
docker compose down -v
docker compose up --build
```

`-v` supprime le volume `db-data` (et donc toutes les simulations). Sans
`-v`, `docker compose down` puis `docker compose up` conservent les données.

### Sauvegarder / restaurer les données

```powershell
# Sauvegarder le fichier SQLite du volume vers l'hôte
docker run --rm -v report-voix-elections_db-data:/data -v ${PWD}:/backup alpine `
  cp /data/app.db /backup/app.db.bak

# Restaurer (le service doit être arrêté)
docker compose stop
docker run --rm -v report-voix-elections_db-data:/data -v ${PWD}:/backup alpine `
  cp /backup/app.db.bak /data/app.db
docker compose start
```


## Utilisation

1. Sur la page d'accueil, créer une simulation (nom libre, ex : "Présidentielle
   2027 – scénario A").
2. Dans la simulation :
   - Renseigner le nombre d'inscrits et l'abstention du 1er tour.
   - Ajouter les candidats du 1er tour (nom, parti, % de voix).
   - Renseigner, pour chaque candidat, la répartition de ses voix au 2e tour
     (% vers chacun des 2 finalistes + % d'abstention). Chaque ligne doit
     idéalement totaliser 100 %.
   - Consulter les résultats calculés du 2e tour et le diagramme de Sankey.
3. Depuis la liste des simulations, dupliquer une simulation permet de créer
   rapidement une variante (autre hypothèse de reports de voix, autre niveau
   d'abstention, etc.).
4. Pour partager un scénario, cliquer sur **Partager** dans son en-tête, puis
  télécharger l'image PNG carrée contenant uniquement le code de partage.
5. Dans la barre latérale d'une autre instance, cliquer sur **Importer un
  scénario**, choisir l'image exportée ou coller une image depuis le
  presse-papiers, puis confirmer la création du nouveau scénario.

Des avertissements s'affichent si la somme des pourcentages du 1er tour ou
d'une ligne de la matrice de reports ne fait pas 100 %, mais cela n'empêche
pas le calcul (utile pour explorer des scénarios en cours de saisie).

## Structure du projet

```
app/
  __init__.py       # Factory Flask (config, init DB, blueprint API, service du SPA React)
  models.py         # Modèles SQLAlchemy : Simulation, Candidate, Transfer
  services.py       # Calcul des résultats du 2e tour + données du Sankey + sérialisation JSON
  api.py            # Routes de l'API JSON (/api/simulations/...)
  utils.py          # Conversions numériques tolérantes (to_int/to_float)
frontend/
  src/
    App.jsx                    # Routes (react-router) + layout général
    api.js                     # Client HTTP vers /api/...
    context/SimulationsContext.jsx  # Liste des simulations partagée (sidebar + pages)
    hooks/useGridNavigation.js # Navigation clavier façon tableur dans les tableaux éditables
    utils/debounceByKey.js     # Auto-sauvegarde différée par champ (sans bouton "Enregistrer")
    components/                # Sidebar, modales partage/import, tableaux, résultats, Sankey (SVG)
    utils/scenarioExchange.js  # Contrat versionné, compression et validation du QR
  vite.config.js    # Dev server (proxy /api -> Flask) + build de production
wsgi.py             # Point d'entrée WSGI (gunicorn)
requirements.txt
Dockerfile          # Multi-stage : build Node du frontend, puis image Python + assets buildés
docker-compose.yml
```

## Développement local sans reconstruire l'image Docker à chaque changement

Pour itérer rapidement sur le frontend avec rechargement à chaud, lancez le
backend et le frontend séparément :

```powershell
# Terminal 1 : API Flask (recharge auto activée)
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
$env:DATA_DIR = "./data"
$env:FRONTEND_DIST = "./frontend/dist"   # ignoré tant que le frontend n'est pas buildé
python wsgi.py
```

```powershell
# Terminal 2 : frontend React avec rechargement à chaud (Vite)
cd frontend
npm install
npm run dev
```

Ouvrir http://localhost:5173 (Vite proxifie automatiquement les appels
`/api/...` vers Flask sur le port 5000, voir `frontend/vite.config.js`).

## Tests unitaires

Les calculs de voix, les reports de voix, la remobilisation des abstentionnistes
et la cohérence des flux Sankey sont couverts par pytest :

```powershell
python -m pytest -q
```

Les dépendances de test sont incluses dans `requirements.txt`.

## Intégration continue

GitHub Actions exécute automatiquement, sur chaque push vers `main` ou `master`
et sur chaque pull request :

- les tests pytest ;
- le build du frontend avec `npm ci` ;
- le build de l'image Docker après réussite des deux contrôles précédents.

La workflow est définie dans `.github/workflows/ci.yml`.

## Limites connues

- Outil pensé pour un usage local / de développement : pas d'authentification,
  pas de protection CSRF/CORS spécifique (l'API et le frontend sont servis par
  la même origine en production).
- Un seul type de scrutin est géré (uninominal majoritaire à 2 tours).
- La victoire au 1er tour n'est pas prise en compte : le 2e tour est toujours calculé.
- Le diagramme de Sankey est un composant React/SVG fait maison (pas de
  bibliothèque de graphes externe), suffisant pour visualiser les flux de
  voix sans dépendance réseau supplémentaire au runtime.

