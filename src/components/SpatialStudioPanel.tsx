// SPDX-License-Identifier: AGPL-3.0-only
import { useEffect, useId, useMemo, useState, type ComponentType } from 'react';
import {
  Accessibility, Armchair, BedDouble, BookOpen, Box, Check, Eye, EyeOff,
  Focus, Flower2, Info, Layers3, Library, LockKeyhole, Monitor, MousePointer2,
  Move3D, PanelTop, Plus, RotateCcw, RotateCw, ScanLine, Search, ShoppingCart,
  Signpost, Sofa, Square, Trash2, UserRound, X,
} from 'lucide-react';
import { ASSET_CATALOG, type SpatialObject } from './spatialTypes';
import '../studio.css';

export type EditMode = 'inspect' | 'translate' | 'rotate';
export type TransformPatch = { x?: number; y?: number; z?: number; rotation?: number };
type Category = SpatialObject['category'];

const categoryLabels: Record<Category, string> = {
  architecture: 'Structure', furniture: 'Furniture', equipment: 'Equipment',
  signage: 'Signage', plant: 'Plants', person: 'People',
};
const categoryOrder: Category[] = ['furniture', 'equipment', 'signage', 'plant', 'person', 'architecture'];
const kindIcons: Record<string, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  chair: Armchair, desk: Monitor, table: PanelTop, counter: PanelTop, bookshelf: BookOpen,
  wheelchair: Accessibility, bed: BedDouble, cart: ShoppingCart, kiosk: Monitor,
  sign: Signpost, planter: Flower2, scanner: ScanLine, 'rehab-bars': Accessibility,
  bench: Sofa, 'privacy-screen': PanelTop,
};
const categoryIcons: Record<Category, ComponentType<{ size?: number; 'aria-hidden'?: boolean }>> = {
  architecture: Layers3, furniture: Armchair, equipment: Box,
  signage: Signpost, plant: Flower2, person: UserRound,
};
const number = (value: number) => Number(value.toFixed(2));
function ObjectIcon({ object, size = 16 }: { object: Pick<SpatialObject, 'kind' | 'category'>; size?: number }) {
  const Icon = kindIcons[object.kind] ?? categoryIcons[object.category] ?? Box;
  return <Icon size={size} aria-hidden />;
}

export type ObjectBrowserProps = {
  objects: SpatialObject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onFocus?: (id: string) => void;
  hiddenIds?: ReadonlySet<string>;
  floor?: string;
};

/** A keyboard-accessible alternative to selecting small objects in the 3D viewport. */
export function ObjectBrowser({ objects, selectedId, onSelect, onFocus, hiddenIds, floor }: ObjectBrowserProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<Category | 'all'>('all');
  const [limit, setLimit] = useState(60);
  const scope = useMemo(() => objects.filter(object => !floor || floor === 'all' || object.floor === floor), [objects, floor]);
  const counts = useMemo(() => {
    const next: Partial<Record<Category, number>> = {};
    for (const object of scope) next[object.category] = (next[object.category] ?? 0) + 1;
    return next;
  }, [scope]);
  const filtered = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return scope.filter(object => {
      if (category !== 'all' && object.category !== category) return false;
      const text = `${object.name} ${object.kind} ${object.zone} ${object.floor} ${categoryLabels[object.category]}`.toLowerCase();
      return words.every(word => text.includes(word));
    });
  }, [scope, category, query]);
  useEffect(() => setLimit(60), [query, category, floor]);
  const shown = filtered.slice(0, limit);

  return <section className="studio-panel studio-object-browser" aria-label="Scene objects">
    <div className="studio-panel-head"><h2 className="studio-panel-title"><Layers3 size={17} /> Scene objects</h2><span className="studio-count">{scope.length}</span></div>
    <div className="studio-search"><Search size={15} aria-hidden /><input aria-label="Search scene objects" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Find an object, person or zone" />{query && <button className="studio-icon-button" aria-label="Clear object search" onClick={() => setQuery('')}><X size={14} /></button>}</div>
    <div className="studio-categories" role="group" aria-label="Filter scene object category">
      <button className="studio-category" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All <span>{scope.length}</span></button>
      {categoryOrder.filter(value => counts[value]).map(value => <button key={value} className="studio-category" aria-pressed={category === value} onClick={() => setCategory(value)}>{categoryLabels[value]} <span>{counts[value]}</span></button>)}
    </div>
    <div className="studio-object-list">
      {shown.map(object => <div className={`studio-object-row${selectedId === object.id ? ' is-selected' : ''}${hiddenIds?.has(object.id) ? ' is-hidden' : ''}`} key={object.id}>
        <button className="studio-object-select" onClick={() => onSelect(object.id)} aria-pressed={selectedId === object.id} aria-label={`Select ${object.name}, ${object.floor}, ${object.zone}${hiddenIds?.has(object.id) ? ', hidden' : ''}`}>
          <span className="studio-object-icon"><ObjectIcon object={object} /></span>
          <span className="studio-object-text"><strong className="studio-object-name">{object.name}</strong><span className="studio-object-meta"><span>{object.floor}</span><span aria-hidden>·</span><span>{object.zone}</span>{hiddenIds?.has(object.id) && <EyeOff size={12} aria-label="Hidden" />}</span>{selectedId === object.id && <span className="studio-object-coordinates">X {number(object.position.x)} · Z {number(object.position.z)}</span>}</span>
          {selectedId === object.id && <Check size={13} aria-hidden />}
        </button>
        {onFocus && <button className="studio-icon-button" aria-label={`Focus on ${object.name}`} title={`Focus on ${object.name}`} onClick={() => { onSelect(object.id); onFocus(object.id); }}><Focus size={15} /></button>}
      </div>)}
      {!shown.length && <div className="studio-empty"><Search size={24} /><strong>No matching objects</strong><p>{query ? 'Try a name, zone or object type.' : 'Choose another category or floor.'}</p></div>}
    </div>
    <div className="studio-list-footer"><span aria-live="polite">{Math.min(limit, filtered.length)} of {filtered.length} objects</span>{limit < filtered.length && <button onClick={() => setLimit(value => value + 60)}>Show 60 more</button>}</div>
  </section>;
}

type NumericFieldProps = {
  label: string; value: number; onCommit: (value: number) => void; disabled?: boolean;
  min: number; max: number; step?: number; axis?: 'x' | 'y' | 'z';
};
function NumericField({ label, value, onCommit, disabled, min, max, step = .1, axis }: NumericFieldProps) {
  const id = useId();
  const [draft, setDraft] = useState(String(number(value)));
  const [error, setError] = useState('');
  useEffect(() => { setDraft(String(number(value))); setError(''); }, [value]);
  function commit() {
    const next = Number(draft);
    if (!draft.trim() || !Number.isFinite(next) || next < min || next > max) {
      setError(`Use ${min} to ${max}.`);
      return;
    }
    setError('');
    if (Math.abs(next - value) > .00001) onCommit(next);
  }
  return <label className="studio-transform-field" htmlFor={id}>
    <span>{axis && <i className={`studio-axis studio-axis-${axis}`} aria-hidden />}{label}</span>
    <input id={id} aria-label={axis ? `Position ${axis.toUpperCase()}` : label} type="number" inputMode="decimal" min={min} max={max} step={step} disabled={disabled} value={draft} onChange={event => { setDraft(event.target.value); setError(''); }} onBlur={commit} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} aria-invalid={!!error} aria-describedby={error ? `${id}-error` : undefined} />
    {error && <small id={`${id}-error`} role="alert">{error}</small>}
  </label>;
}

export type ObjectInspectorProps = {
  object: SpatialObject | null;
  hidden: boolean;
  onFocus: () => void;
  onChange: (patch: TransformPatch) => void;
  onToggleHidden: () => void;
  onReset: () => void;
  onDelete?: () => void;
  canEdit: boolean;
  mode: EditMode;
  onMode: (mode: EditMode) => void;
};

export function ObjectInspector({ object, hidden, onFocus, onChange, onToggleHidden, onReset, onDelete, canEdit, mode, onMode }: ObjectInspectorProps) {
  if (!object) return <section className="studio-panel studio-object-inspector" aria-label="Object inspector"><div className="studio-panel-head"><h2 className="studio-panel-title"><MousePointer2 size={17} /> Object inspector</h2></div><div className="studio-empty"><Focus size={30} /><strong>Every detail has a place.</strong><p>Select an object in the model or the scene list to explore it, focus the camera, and adjust your layout.</p></div><div className="studio-model-note"><Info size={14} /><span>Select furniture, signs, equipment or an animated person.</span></div></section>;
  const editable = canEdit && object.editable;
  const degrees = object.rotation * 180 / Math.PI;
  const rotateBy = (delta: number) => {
    const next = ((degrees + delta + 180) % 360 + 360) % 360 - 180;
    onChange({ rotation: next * Math.PI / 180 });
  };
  return <section className="studio-panel studio-object-inspector" aria-label="Object inspector">
    <div className="studio-panel-head"><h2 className="studio-panel-title"><MousePointer2 size={17} /> Object inspector</h2><button className="studio-icon-button" aria-label="Focus selected object" title="Focus selected object" onClick={onFocus}><Focus size={16} /></button></div>
    <div className="studio-inspector-hero"><span className="studio-object-icon"><ObjectIcon object={object} size={25} /></span><div><span className="studio-kicker">{categoryLabels[object.category]}</span><h3>{object.name}</h3><div className="studio-badges"><span className="studio-badge">{object.floor}</span><span className={`studio-badge${hidden ? ' studio-badge-warning' : ''}`}>{hidden ? <EyeOff size={11} /> : <Eye size={11} />}{hidden ? 'Hidden' : 'Visible'}</span></div></div></div>
    <div className="studio-panel-body">
      <p className="studio-inspector-description">{object.description}</p>
      <dl className="studio-detail-grid"><div><dt>Reference zone</dt><dd>{object.zone}</dd></div><div><dt>Object type</dt><dd>{object.kind.replaceAll('-', ' ')}</dd></div><div className="studio-wide"><dt>Dimensions · width × height × depth</dt><dd>{number(object.size.x)} × {number(object.size.y)} × {number(object.size.z)} <span className="studio-muted">scene units</span></dd></div></dl>
      <div className="studio-mode-group" role="group" aria-label="Object manipulation mode">
        <button onClick={() => onMode('inspect')} aria-pressed={mode === 'inspect'}><MousePointer2 size={14} />Inspect</button>
        <button onClick={() => onMode('translate')} aria-pressed={mode === 'translate'} disabled={!editable}><Move3D size={14} />Move</button>
        <button onClick={() => onMode('rotate')} aria-pressed={mode === 'rotate'} disabled={!editable}><RotateCw size={14} />Rotate</button>
      </div>
      <div className="studio-transform-heading">Position <span>Local to {object.floor}</span></div>
      <div className="studio-transform-grid" key={object.id}>
        <NumericField label="X" axis="x" value={object.position.x} min={-45} max={45} disabled={!editable} onCommit={x => onChange({ x })} />
        <NumericField label="Height" axis="y" value={object.position.y} min={0} max={6} disabled={!editable} onCommit={y => onChange({ y })} />
        <NumericField label="Z" axis="z" value={object.position.z} min={-22} max={22} disabled={!editable} onCommit={z => onChange({ z })} />
      </div>
      <div className="studio-rotation-row" key={`rotation-${object.id}`}><NumericField label="Rotation (degrees)" value={degrees} min={-360} max={360} step={15} disabled={!editable} onCommit={value => onChange({ rotation: value * Math.PI / 180 })} /><button className="studio-button" aria-label="Rotate left 90 degrees" title="Rotate left 90 degrees" onClick={() => rotateBy(-90)} disabled={!editable}><RotateCcw size={15} /></button><button className="studio-button" aria-label="Rotate right 90 degrees" title="Rotate right 90 degrees" onClick={() => rotateBy(90)} disabled={!editable}><RotateCw size={15} /></button></div>
      {!editable && <p className="studio-readonly"><LockKeyhole size={14} /><span>{!canEdit ? 'Your role can explore this scene. A coordinator can edit the layout.' : object.category === 'person' ? 'This figure follows the rehearsal timeline. Edit its route in the people panel.' : 'Building geometry is a fixed reference. Select furniture or equipment to edit the layout.'}</span></p>}
      {editable && <p className="studio-inspector-footnote">{mode === 'translate' ? 'Drag a colored handle in the model to move this object.' : mode === 'rotate' ? 'Drag the rotation ring in the model to change its orientation.' : 'Choose Move or Rotate to use the controls in the model.'} Press Enter or leave a field to apply a value.</p>}
      <div className="studio-action-row"><button className="studio-button" onClick={onFocus}><Focus size={14} />Focus</button><button className="studio-button" disabled={!editable} onClick={onToggleHidden}>{hidden ? <Eye size={14} /> : <EyeOff size={14} />}{hidden ? 'Show' : 'Hide'}</button><button className="studio-button" disabled={!editable} onClick={onReset}><RotateCcw size={14} />Reset</button></div>
      {onDelete && editable && <div className="studio-action-row"><button className="studio-button studio-button-danger" onClick={onDelete}><Trash2 size={14} />Remove added object</button></div>}
    </div>
  </section>;
}

export type AssetPaletteProps = { onAdd: (kind: string) => void; disabled?: boolean };
export function AssetPalette({ onAdd, disabled = false }: AssetPaletteProps) {
  const [category, setCategory] = useState<Category | 'all'>('all');
  const categories = categoryOrder.filter(value => ASSET_CATALOG.some(asset => asset.category === value));
  const assets = ASSET_CATALOG.filter(asset => category === 'all' || asset.category === category);
  return <section className="studio-panel studio-asset-library" aria-label="Asset library">
    <div className="studio-panel-head"><h2 className="studio-panel-title"><Library size={17} /> Asset library</h2><span className="studio-count">{ASSET_CATALOG.length}</span></div>
    <p className="studio-library-intro">Build a thoughtful place to volunteer. Add an object, then arrange it in the model.</p>
    {disabled && <p className="studio-readonly"><LockKeyhole size={14} /><span>Select a single floor with editing access to place an object.</span></p>}
    <div className="studio-categories" role="group" aria-label="Filter asset library"><button className="studio-category" aria-pressed={category === 'all'} onClick={() => setCategory('all')}>All</button>{categories.map(value => <button key={value} className="studio-category" aria-pressed={category === value} onClick={() => setCategory(value)}>{categoryLabels[value]}</button>)}</div>
    <div className="studio-asset-grid">{assets.map(asset => <button key={asset.kind} className="studio-asset-card" onClick={() => onAdd(asset.kind)} disabled={disabled} title={asset.description} aria-label={`Add ${asset.name}`}><ObjectIcon object={asset} size={25} /><Plus size={14} className="studio-asset-plus" aria-hidden /><strong>{asset.name}</strong><span>{number(asset.size.x)} × {number(asset.size.z)} footprint</span></button>)}</div>
    <div className="studio-model-note"><Square size={14} /><span>Individually modeled parts. Original, illustrative assets.</span></div>
  </section>;
}
