import React, { useEffect, useState } from 'react';
import { Shield, Zap, Check, BookmarkPlus, DollarSign, Crosshair } from 'lucide-react';
import { EQUIPMENT_SPECS, WEAPON_SPECS } from '../../shared/weapons';
import { WeaponSpec } from '../../shared/types';
import { BuyPreset, useGamePlatformStore } from '../core/gameStateStore';
import { soundEngine } from '../audio/soundEngine';

interface BuyMenuOverlayProps {
  team: 'SENTINEL' | 'VORTEX';
  money: number;
  armor: number;
  hasHelmet: boolean;
  hasDefuseKit: boolean;
  ownedWeapons: string[];
  ownedGrenades: string[];
  onBuyWeapon: (weaponId: string) => void;
  onBuyEquipment: (equipId: 'kevlar_vest' | 'kevlar_helmet' | 'defuse_kit') => void;
  onApplyPreset: (preset: BuyPreset) => void;
  onClose: () => void;
}

type BuyTabCategory = 'PISTOLS' | 'SMGS' | 'RIFLES' | 'SNIPERS' | 'HEAVY' | 'GRENADES' | 'EQUIPMENT';

export const BuyMenuOverlay: React.FC<BuyMenuOverlayProps> = ({
  team,
  money,
  armor,
  hasHelmet,
  hasDefuseKit,
  ownedWeapons,
  ownedGrenades,
  onBuyWeapon,
  onBuyEquipment,
  onApplyPreset,
  onClose
}) => {
  const [selectedCat, setSelectedCat] = useState<BuyTabCategory>('RIFLES');
  const [hoveredWeapon, setHoveredWeapon] = useState<WeaponSpec | null>(
    WEAPON_SPECS[team === 'SENTINEL' ? 'vanguard_m4s' : 'harbinger_47']
  );
  const [customPresetName, setCustomPresetName] = useState('');
  const { buyPresets, saveBuyPreset } = useGamePlatformStore();

  const categories: Array<{ id: BuyTabCategory; keyNum: string; label: string }> = [
    { id: 'PISTOLS', keyNum: '1', label: 'PISTOLS' },
    { id: 'SMGS', keyNum: '2', label: 'SMGS' },
    { id: 'RIFLES', keyNum: '3', label: 'RIFLES' },
    { id: 'SNIPERS', keyNum: '4', label: 'SNIPERS' },
    { id: 'HEAVY', keyNum: '5', label: 'HEAVY' },
    { id: 'GRENADES', keyNum: '6', label: 'GRENADES' },
    { id: 'EQUIPMENT', keyNum: '7', label: 'EQUIPMENT' }
  ];

  // Direct category navigation via the number keys displayed on each tab.
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      const match = categories.find((c) => e.code === `Digit${c.keyNum}`);
      if (match) {
        e.preventDefault();
        setSelectedCat(match.id);
        soundEngine.playUiSound('hover');
      } else if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onClose]);

  const getFilteredWeapons = (cat: BuyTabCategory): WeaponSpec[] => {
    const all = Object.values(WEAPON_SPECS).filter((w) => w.team === 'BOTH' || w.team === team);
    if (cat === 'PISTOLS') return all.filter((w) => w.category === 'Pistols');
    if (cat === 'SMGS') return all.filter((w) => w.category === 'SMGs');
    if (cat === 'RIFLES') return all.filter((w) => w.category === 'Rifles');
    if (cat === 'SNIPERS') return all.filter((w) => w.category === 'Snipers');
    if (cat === 'HEAVY') return all.filter((w) => w.category === 'Shotguns' || w.category === 'MachineGuns');
    if (cat === 'GRENADES') return all.filter((w) => w.category === 'Grenades');
    return [];
  };

  // Economy Recommendation Advisor
  const recommendation =
    money >= 4200
      ? `Full Buy Recommended: ${team === 'SENTINEL' ? 'Vanguard-M4S' : 'Harbinger-47'} + Heavy Armor + Smoke/Flash`
      : money >= 2100
      ? 'Force / Half-Buy Recommended: Vector-9 SMG + Kevlar Vest + Flashbang'
      : 'Eco Save Round Recommended: Viper-P250 or Keep Default Sidearm (Save >= $2000 for next round)';

  const handleSaveCurrentAsPreset = () => {
    const name = customPresetName.trim() || `Custom Loadout #${buyPresets.length + 1}`;
    const primary = ownedWeapons.find((id) => WEAPON_SPECS[id]?.slot === 'primary') || null;
    const secondary = ownedWeapons.find((id) => WEAPON_SPECS[id]?.slot === 'secondary') || 'vp9_tactical';
    saveBuyPreset({
      id: `custom_${Date.now()}`,
      name,
      primaryWeaponId: primary,
      secondaryWeaponId: secondary,
      armorType: hasHelmet ? 'kevlar_helmet' : armor > 0 ? 'kevlar_vest' : 'none',
      defuseKit: hasDefuseKit,
      grenades: [...ownedGrenades]
    });
    setCustomPresetName('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
      <div className="flex h-[86vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl border border-slate-700 bg-[#0c1118] text-slate-100 shadow-2xl">
        {/* Top Header */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-800 bg-[#101722] px-6 py-4">
          <div className="flex items-center gap-4">
            <div
              className={`rounded px-3 py-1 text-xs font-black uppercase tracking-widest ${
                team === 'SENTINEL'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
              }`}
            >
              {team} ARMORY
            </div>
            <div>
              <h2 className="text-lg font-extrabold tracking-wide text-white">TACTICAL REQUISITION MATRIX</h2>
              <p className="text-xs text-slate-400">{recommendation}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-4 py-2">
              <DollarSign className="h-5 w-5 text-emerald-400" />
              <div>
                <div className="text-[10px] font-bold uppercase text-emerald-300/80">AVAILABLE FUNDS</div>
                <div className="font-mono text-xl font-black text-emerald-400">${money.toLocaleString()}</div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-700 bg-slate-800/80 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-200 hover:bg-slate-700"
            >
              CLOSE [B / ESC]
            </button>
          </div>
        </div>

        {/* Category Tabs */}
        <div className="grid grid-cols-7 border-b border-slate-800 bg-[#0e141d]">
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(cat.id)}
              className={`flex items-center justify-center gap-2 border-b-2 py-3 text-xs font-extrabold tracking-wider transition ${
                selectedCat === cat.id
                  ? 'border-cyan-400 bg-cyan-500/10 text-cyan-300'
                  : 'border-transparent text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <span className="rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                {cat.keyNum}
              </span>
              {cat.label}
            </button>
          ))}
        </div>

        {/* Main Content Grid */}
        <div className="grid flex-1 grid-cols-12 overflow-hidden">
          {/* Left 7 Cols: Weapon / Equipment Cards */}
          <div className="col-span-8 overflow-y-auto border-r border-slate-800 p-5">
            {selectedCat !== 'EQUIPMENT' ? (
              <div className="grid grid-cols-2 gap-3">
                {getFilteredWeapons(selectedCat).map((w) => {
                  const isOwned = ownedWeapons.includes(w.id) || ownedGrenades.includes(w.id);
                  const canAfford = money >= w.price;
                  return (
                    <button
                      key={w.id}
                      onMouseEnter={() => setHoveredWeapon(w)}
                      onClick={() => onBuyWeapon(w.id)}
                      disabled={!canAfford && !isOwned}
                      className={`group flex flex-col justify-between rounded-lg border p-4 text-left transition ${
                        isOwned
                          ? 'border-cyan-500/60 bg-cyan-950/25'
                          : canAfford
                          ? 'border-slate-800 bg-slate-900/70 hover:border-cyan-500/50 hover:bg-slate-800/80'
                          : 'cursor-not-allowed border-slate-800/50 bg-slate-950/40 opacity-50'
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">
                            {w.code} // {w.team === 'BOTH' ? 'UNIVERSAL' : w.team}
                          </div>
                          <div className="mt-0.5 text-base font-extrabold text-white">{w.name}</div>
                        </div>
                        {isOwned ? (
                          <span className="flex items-center gap-1 rounded bg-cyan-500/20 px-2 py-0.5 text-[11px] font-bold text-cyan-300">
                            <Check className="h-3.5 w-3.5" /> EQUIPPED
                          </span>
                        ) : (
                          <span
                            className={`font-mono text-sm font-black ${
                              canAfford ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            ${w.price}
                          </span>
                        )}
                      </div>

                      {/* Stylized SVG Weapon Silhouette Preview */}
                      <div className="my-3 flex h-12 items-center justify-center rounded bg-slate-950/70 px-3">
                        <div
                          className="h-2.5 w-3/4 rounded-sm"
                          style={{
                            background: `linear-gradient(90deg, ${w.accentColor}, rgba(148,163,184,0.3))`
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>DMG: {w.damage}{w.pellets ? `x${w.pellets}` : ''}</span>
                        <span>MAG: {w.magazineSize}/{w.reserveAmmo}</span>
                        <span>AP: {Math.round(w.armorPenetration * 100)}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {EQUIPMENT_SPECS.filter((e) => e.team === 'BOTH' || e.team === team).map((eq) => {
                  const isOwned =
                    (eq.id === 'kevlar_vest' && armor >= 100) ||
                    (eq.id === 'kevlar_helmet' && armor >= 100 && hasHelmet) ||
                    (eq.id === 'defuse_kit' && hasDefuseKit);
                  const canAfford = money >= eq.price;
                  return (
                    <button
                      key={eq.id}
                      onClick={() => onBuyEquipment(eq.id as 'kevlar_vest' | 'kevlar_helmet' | 'defuse_kit')}
                      disabled={!canAfford || isOwned}
                      className={`flex items-center justify-between rounded-lg border p-4 text-left transition ${
                        isOwned
                          ? 'border-cyan-500/60 bg-cyan-950/25'
                          : canAfford
                          ? 'border-slate-800 bg-slate-900/70 hover:border-cyan-500/50'
                          : 'cursor-not-allowed border-slate-800/50 bg-slate-950/40 opacity-50'
                      }`}
                    >
                      <div className="flex items-center gap-4">
                        <Shield className="h-8 w-8 text-cyan-400" />
                        <div>
                          <div className="text-base font-extrabold text-white">{eq.name}</div>
                          <div className="text-xs text-slate-400">{eq.description}</div>
                        </div>
                      </div>
                      <div className="font-mono text-base font-black text-emerald-400">
                        {isOwned ? 'OWNED' : `$${eq.price}`}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Quick Buy Presets Bar */}
            <div className="mt-6 border-t border-slate-800 pt-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-slate-300">
                  ONE-CLICK TACTICAL BUY PRESETS
                </span>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={customPresetName}
                    onChange={(e) => setCustomPresetName(e.target.value)}
                    placeholder="Custom preset name..."
                    className="rounded border border-slate-700 bg-slate-900 px-2.5 py-1 text-xs text-white"
                  />
                  <button
                    onClick={handleSaveCurrentAsPreset}
                    className="flex items-center gap-1 rounded bg-cyan-600 px-2.5 py-1 text-xs font-bold text-white hover:bg-cyan-500"
                  >
                    <BookmarkPlus className="h-3.5 w-3.5" /> Save Current Loadout
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {buyPresets.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => onApplyPreset(preset)}
                    className="flex items-center justify-between rounded border border-slate-700/80 bg-slate-900/90 px-3 py-2 text-left text-xs font-bold text-slate-200 hover:border-amber-400/60 hover:bg-slate-800"
                  >
                    <span className="truncate">{preset.name}</span>
                    <Zap className="h-3.5 w-3.5 shrink-0 text-amber-400" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right 4 Cols: Weapon Ballistics & Current Loadout Inspector */}
          <div className="col-span-4 flex flex-col justify-between bg-[#0a0e14] p-5">
            {hoveredWeapon ? (
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded bg-slate-800 px-2 py-0.5 font-mono text-[10px] font-bold text-cyan-400">
                    {hoveredWeapon.category.toUpperCase()}
                  </span>
                  <span className="font-mono text-lg font-black text-emerald-400">${hoveredWeapon.price}</span>
                </div>
                <h3 className="mt-1 text-xl font-black text-white">{hoveredWeapon.name}</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-400">{hoveredWeapon.description}</p>

                <div className="mt-4 space-y-2.5 border-t border-slate-800 pt-4 text-xs">
                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>Base Damage / Headshot</span>
                      <span className="font-mono font-bold text-white">
                        {hoveredWeapon.damage} / {Math.round(hoveredWeapon.damage * hoveredWeapon.headMultiplier)}
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-800">
                      <div
                        className="h-1.5 rounded-full bg-cyan-400"
                        style={{ width: `${Math.min(100, (hoveredWeapon.damage / 115) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>Armor Penetration</span>
                      <span className="font-mono font-bold text-white">
                        {Math.round(hoveredWeapon.armorPenetration * 100)}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-800">
                      <div
                        className="h-1.5 rounded-full bg-amber-400"
                        style={{ width: `${hoveredWeapon.armorPenetration * 100}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-300">
                      <span>Fire Rate (RPM)</span>
                      <span className="font-mono font-bold text-white">{hoveredWeapon.fireRateRpm} RPM</span>
                    </div>
                    <div className="mt-1 h-1.5 w-full rounded-full bg-slate-800">
                      <div
                        className="h-1.5 rounded-full bg-emerald-400"
                        style={{ width: `${Math.min(100, (hoveredWeapon.fireRateRpm / 860) * 100)}%` }}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2">
                    <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                      <div className="text-[10px] text-slate-400">KILL AWARD</div>
                      <div className="font-mono text-sm font-bold text-emerald-400">${hoveredWeapon.killReward}</div>
                    </div>
                    <div className="rounded border border-slate-800 bg-slate-900/60 p-2">
                      <div className="text-[10px] text-slate-400">MOBILITY</div>
                      <div className="font-mono text-sm font-bold text-white">
                        {Math.round(hoveredWeapon.moveSpeedMultiplier * 250)} u/s
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Current Equipped Inventory Summary */}
            <div className="rounded-lg border border-slate-800 bg-slate-900/70 p-3.5">
              <div className="mb-2 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-cyan-400">
                <Crosshair className="h-3.5 w-3.5" /> CURRENT OPERATIVE LOADOUT
              </div>
              <div className="space-y-1 text-xs text-slate-300">
                <div className="flex justify-between">
                  <span className="text-slate-400">Armor:</span>
                  <span className="font-bold text-white">
                    {armor > 0 ? `${armor} AP ${hasHelmet ? '+ Helmet' : '(Vest)'}` : 'None'}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Weapons:</span>
                  <span className="font-bold text-white">
                    {ownedWeapons.map((id) => WEAPON_SPECS[id]?.name || id).join(', ')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Utility:</span>
                  <span className="font-bold text-white">
                    {ownedGrenades.length > 0
                      ? ownedGrenades.map((id) => WEAPON_SPECS[id]?.name || id).join(', ')
                      : 'Empty'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
