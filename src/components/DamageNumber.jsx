import './DamageNumber.css';

const DamageNumber = ({ entries }) =>
  entries.map((entry) => (
    <div
      key={entry.id}
      className={`damage-number ${entry.isCrit ? 'crit' : ''} effect-${entry.effectiveness || 'normal'} ${entry.missed ? 'missed' : ''}`}
      style={{ left: entry.x, top: entry.y }}
    >
      {entry.missed ? 'MISS' : entry.damage}
      {entry.effectiveness === 'super' && <span className="effect-label">SUPER!</span>}
      {entry.effectiveness === 'ultra' && <span className="effect-label">X4!</span>}
      {entry.effectiveness === 'resisted' && <span className="effect-label">RESISTIU</span>}
      {entry.effectiveness === 'immune' && <span className="effect-label">IMUNE</span>}
      {entry.isCrit && <span className="crit-label">CRITICO!</span>}
    </div>
  ));

export default DamageNumber;
