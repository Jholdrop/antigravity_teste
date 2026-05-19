import { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';
import { getPokemonSpecies } from '../api/pokeapi';
import '@google/model-viewer';
import './PokemonModal.css';

const PokemonModal = ({ pokemon, onClose, onAdd, inTeam }) => {
  const [species, setSpecies] = useState(null);
  const [imageType, setImageType] = useState('normal'); // normal, shiny

  useEffect(() => {
    if (pokemon) {
      getPokemonSpecies(pokemon.name).then(data => setSpecies(data));
      // Lock scroll
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'auto';
      };
    }
  }, [pokemon]);

  if (!pokemon) return null;

  const mainType = pokemon.types[0].type.name;
  
  const images = {
    normal: pokemon.sprites.other['official-artwork'].front_default || pokemon.sprites.front_default,
    shiny: pokemon.sprites.other['official-artwork'].front_shiny || pokemon.sprites.front_shiny
  };

  const currentImage = images[imageType] || images.normal;
  
  const category = imageType === 'shiny' ? 'shiny' : 'regular';
  const modelUrl = `https://raw.githubusercontent.com/Pokemon-3D-api/assets/refs/heads/main/models/opt/${category}/${pokemon.id}.glb`;

  const toggleShiny = () => {
    setImageType(prev => prev === 'normal' ? 'shiny' : 'normal');
  };

  const getStatWidth = (val) => `${Math.min((val / 255) * 100, 100)}%`;

  return (
    <div className="modal-overlay animate-fade-in" onClick={onClose}>
      <div 
        className={`modal-content glass-panel type-${mainType}`} 
        onClick={(e) => e.stopPropagation()}
      >
        <button className="close-btn" onClick={onClose}>
          <X size={24} />
        </button>

        <div className="modal-header">
          <div className="modal-title">
            <h2>{pokemon.name}</h2>
            <span className="modal-id">#{pokemon.id.toString().padStart(3, '0')}</span>
          </div>
          <div className="modal-types">
            {pokemon.types.map(t => (
              <span key={t.type.name} className="type-badge" style={{ backgroundColor: `var(--type-${t.type.name})` }}>
                {t.type.name}
              </span>
            ))}
          </div>
        </div>

        <div className="modal-body">
          <div className="modal-image-section">
            <div className="image-wrapper">
              <model-viewer 
                src={modelUrl}
                poster={currentImage}
                alt={pokemon.name}
                auto-rotate
                camera-controls
                shadow-intensity="1"
                className="modal-pokemon-image"
                style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}
              >
              </model-viewer>
            </div>
            <button className="shiny-toggle" onClick={toggleShiny}>
              <Sparkles size={16} />
              {imageType === 'normal' ? 'Show Shiny' : 'Show Normal'}
            </button>
            <button 
              className="add-team-btn" 
              onClick={onAdd}
              disabled={inTeam}
            >
              {inTeam ? 'No Time' : 'Adicionar ao Time'}
            </button>
            <div className="pokemon-measurements">
              <div className="measurement">
                <span className="label">Height</span>
                <span className="value">{pokemon.height / 10} m</span>
              </div>
              <div className="measurement">
                <span className="label">Weight</span>
                <span className="value">{pokemon.weight / 10} kg</span>
              </div>
            </div>
          </div>

          <div className="modal-info-section">
            <div className="info-block">
              <h3>Abilities</h3>
              <div className="abilities-list">
                {pokemon.abilities.map(a => (
                  <span key={a.ability.name} className="ability-badge">
                    {a.ability.name.replace('-', ' ')} {a.is_hidden && '(Hidden)'}
                  </span>
                ))}
              </div>
            </div>

            <div className="info-block">
              <h3>Base Stats</h3>
              <div className="stats-container">
                {pokemon.stats.map(s => (
                  <div key={s.stat.name} className="stat-row">
                    <span className="stat-name">{s.stat.name.replace('-', ' ')}</span>
                    <span className="stat-value">{s.base_stat}</span>
                    <div className="stat-bar-bg">
                      <div 
                        className="stat-bar-fill" 
                        style={{ 
                          width: getStatWidth(s.base_stat),
                          backgroundColor: `var(--type-${mainType})`
                        }}
                      ></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PokemonModal;
