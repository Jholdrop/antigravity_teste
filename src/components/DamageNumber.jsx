import React from 'react';
import './DamageNumber.css';

const DamageNumber = ({ entries }) =>
  entries.map(e => (
    <div
      key={e.id}
      className={`damage-number ${e.isCrit ? 'crit' : ''}`}
      style={{ left: e.x, top: e.y }}
    >
      {e.damage}
      {e.isCrit && <span className="crit-label">CRÍTICO!</span>}
    </div>
  ));

export default DamageNumber;
