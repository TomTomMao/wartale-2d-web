import type { MercClass } from './types';

export interface BattleSkill {
  id: string;
  name: string;
  icon: string;
  cost: number;
  target: 'enemy' | 'self';
  description: string;
}

const skills: Record<MercClass, BattleSkill[]> = {
  Swordsman: [
    { id:'shield-bash', name:'Shield Bash', icon:'🛡', cost:1, target:'enemy', description:'Adjacent hit; Stuns the target.' },
    { id:'whirlwind', name:'Whirlwind', icon:'🌀', cost:1, target:'self', description:'Damage every adjacent enemy.' },
    { id:'riposte', name:'Riposte', icon:'↩', cost:1, target:'self', description:'Gain armor and prepare a counter stance.' },
    { id:'taunt', name:'Taunt', icon:'📣', cost:0, target:'enemy', description:'Mark an adjacent enemy as Weakened.' }
  ],
  Warrior: [
    { id:'rend', name:'Rend', icon:'🩸', cost:1, target:'enemy', description:'Heavy adjacent hit that causes Bleeding.' },
    { id:'cleave', name:'Cleave', icon:'🪓', cost:1, target:'self', description:'Strike all adjacent enemies.' },
    { id:'rage', name:'Rage', icon:'🔥', cost:1, target:'self', description:'Gain +4 power for this battle.' },
    { id:'execute', name:'Execute', icon:'☠', cost:1, target:'enemy', description:'Massive damage to a wounded target.' }
  ],
  Ranger: [
    { id:'aimed-shot', name:'Aimed Shot', icon:'🎯', cost:1, target:'enemy', description:'Long-range high damage shot.' },
    { id:'pinning-shot', name:'Pinning Shot', icon:'📌', cost:1, target:'enemy', description:'Damage and Root the target.' },
    { id:'volley', name:'Volley', icon:'🏹', cost:2, target:'enemy', description:'Hit target and enemies in adjacent cells.' },
    { id:'quickstep', name:'Quickstep', icon:'💨', cost:1, target:'self', description:'Reset movement this activation.' }
  ],
  Spearman: [
    { id:'long-thrust', name:'Long Thrust', icon:'🔱', cost:1, target:'enemy', description:'Strike up to 3 cells away.' },
    { id:'spear-wall', name:'Spear Wall', icon:'🚧', cost:1, target:'self', description:'Brace: first adjacent attacker is punished.' },
    { id:'sweep', name:'Sweep', icon:'↔', cost:1, target:'self', description:'Damage all adjacent enemies.' },
    { id:'brace', name:'Brace', icon:'⚓', cost:0, target:'self', description:'Gain armor and resist displacement.' }
  ],
  Rogue: [
    { id:'poison-blade', name:'Poison Blade', icon:'☣', cost:1, target:'enemy', description:'Adjacent strike that applies Poison.' },
    { id:'backstab', name:'Backstab', icon:'🗡', cost:1, target:'enemy', description:'High damage, stronger from behind.' },
    { id:'dash', name:'Dash', icon:'⚡', cost:1, target:'self', description:'Reset movement and gain extra grid range.' },
    { id:'smoke-bomb', name:'Smoke Bomb', icon:'💨', cost:1, target:'self', description:'Gain Dodge and break engagement.' }
  ]
};

export function battleSkillsFor(cls?: MercClass): BattleSkill[] {
  return cls ? skills[cls] : [];
}
