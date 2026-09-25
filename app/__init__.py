import os

from flask import Flask, send_from_directory

from app.extensions import db


def create_app():
    frontend_dist = os.environ.get(
        "FRONTEND_DIST", os.path.join(os.path.dirname(os.path.dirname(__file__)), "frontend_dist")
    )
    # static_folder=None : on gère nous-mêmes le service des fichiers (voir spa() ci-dessous),
    # sinon la route statique auto-enregistrée par Flask (même motif "/<path:...>") entre en
    # conflit avec le fallback SPA et intercepte les routes client-side (ex: /simulations/1).
    app = Flask(__name__, static_folder=None)

    data_dir = os.environ.get("DATA_DIR", "/app/data")
    os.makedirs(data_dir, exist_ok=True)
    db_path = os.path.join(data_dir, "app.db")

    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-secret-key")

    db.init_app(app)

    from app.api import bp as api_bp
    app.register_blueprint(api_bp)

    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path):
        """Sert le SPA React buildé (frontend_dist) avec fallback vers index.html pour le routing client."""
        full_path = os.path.join(frontend_dist, path) if path else None
        if full_path and os.path.isfile(full_path):
            return send_from_directory(frontend_dist, path)
        index_path = os.path.join(frontend_dist, "index.html")
        if os.path.isfile(index_path):
            return send_from_directory(frontend_dist, "index.html")
        return (
            "Frontend non buildé : lancez `npm run build` dans le dossier frontend/ "
            "ou utilisez `npm run dev` (Vite) pour le développement.",
            501,
        )

    with app.app_context():
        from app import models  # noqa: F401
        db.create_all()
        _run_migrations()

    return app


def _run_migrations():
    """Ajoute les colonnes manquantes sur une base SQLite existante (pas d'outil de migration)."""
    from sqlalchemy import inspect, text

    from app.extensions import db as _db

    inspector = inspect(_db.engine)
    if "simulations" not in inspector.get_table_names():
        return
    columns = {c["name"] for c in inspector.get_columns("simulations")}
    with _db.engine.begin() as conn:
        if "description" not in columns:
            conn.execute(text("ALTER TABLE simulations ADD COLUMN description TEXT NOT NULL DEFAULT ''"))
        if "position" not in columns:
            conn.execute(text("ALTER TABLE simulations ADD COLUMN position INTEGER NOT NULL DEFAULT 0"))
            conn.execute(text("UPDATE simulations SET position = id"))
        if "abstention_to_a" not in columns:
            conn.execute(text("ALTER TABLE simulations ADD COLUMN abstention_to_a FLOAT NOT NULL DEFAULT 0"))
        if "abstention_to_b" not in columns:
            conn.execute(text("ALTER TABLE simulations ADD COLUMN abstention_to_b FLOAT NOT NULL DEFAULT 0"))

