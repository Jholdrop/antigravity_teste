import { useState, useEffect } from 'react';
import { getPokemonDetails } from '../api/pokeapi';
import './PokemonCard.css';

const PokemonCard = ({ pokemon, onClick }) => {
  const [details, setDetails] = useState(null);

  useEffect(() => {
    getPokemonDetails(pokemon.url).then(data => setDetails(data));
  }, [pokemon.url]);

  if (!details) return <div className="pokemon-card skeleton glass-panel"></div>;

  const mainType = details.types[0].type.name;
  const image = details.sprites.other['official-artwork'].front_default || details.sprites.front_default;
  const idStr = details.id.toString().padStart(3, '0');

  return (
    <div 
      className={`pokemon-card glass-panel animate-fade-in type-${mainType}`}
      onClick={() => onClick(details)}
    >
      <div className="card-header">
        <span className="pokemon-id">#{idStr}</span>
        <div className="pokemon-types-mini">
          {details.types.map(t => (
            <span key={t.type.name} className="type-dot" title={t.type.name} style={{ backgroundColor: `var(--type-${t.type.name})` }}></span>
          ))}
        </div>
      </div>
      
      <div className="card-image-container">
        <img src={image} alt={details.name} className="pokemon-image" loading="lazy" />
      </div>

      <div className="card-info">
        <h3 className="pokemon-name">{details.name}</h3>
      </div>
    </div>
  );
};

export default PokemonCard;
