from datetime import datetime

from app.extensions import db


class Simulation(db.Model):
    __tablename__ = "simulations"

    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(200), nullable=False)
    description = db.Column(db.Text, nullable=False, default="")
    position = db.Column(db.Integer, nullable=False, default=0)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    total_inscrits = db.Column(db.Integer, nullable=False, default=1000)
    abstention_r1 = db.Column(db.Integer, nullable=False, default=0)
    # Report des abstentionnistes du 1er tour vers les 2 finalistes (le reste continue de s'abstenir).
    abstention_to_a = db.Column(db.Float, nullable=False, default=0.0)
    abstention_to_b = db.Column(db.Float, nullable=False, default=0.0)

    candidates = db.relationship(
        "Candidate",
        backref="simulation",
        cascade="all, delete-orphan",
        order_by="Candidate.id",
    )

    @property
    def votants_r1(self):
        return max(self.total_inscrits - self.abstention_r1, 0)


class Candidate(db.Model):
    __tablename__ = "candidates"

    id = db.Column(db.Integer, primary_key=True)
    simulation_id = db.Column(db.Integer, db.ForeignKey("simulations.id"), nullable=False)
    name = db.Column(db.String(200), nullable=False)
    pct_r1 = db.Column(db.Float, nullable=False, default=0.0)

    transfer = db.relationship(
        "Transfer",
        backref="candidate",
        uselist=False,
        cascade="all, delete-orphan",
    )

    @property
    def votes_r1(self):
        return int(round(self.simulation.votants_r1 * self.pct_r1 / 100))


class Transfer(db.Model):
    """Report des voix d'un candidat du 1er tour vers les 2 finalistes ou l'abstention."""

    __tablename__ = "transfers"

    id = db.Column(db.Integer, primary_key=True)
    candidate_id = db.Column(db.Integer, db.ForeignKey("candidates.id"), nullable=False, unique=True)
    pct_to_a = db.Column(db.Float, nullable=False, default=0.0)
    pct_to_b = db.Column(db.Float, nullable=False, default=0.0)

    @property
    def pct_to_abstention(self):
        """Le solde (peut être négatif si les 2 autres colonnes dépassent 100%)."""
        return 100.0 - self.pct_to_a - self.pct_to_b
