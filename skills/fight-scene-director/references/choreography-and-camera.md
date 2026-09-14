# Choreography and Camera

Read this file before generating or revising any formal fight prompt.

## Asset Authority

Extract constraints by asset role instead of letting one image override everything:

- Character image: appearance, clothing, body type, anatomy, visible weapon, and visible ability.
- Weapon or prop image: shape, ownership, opening state, and usable mechanism.
- Scene image: layout, materials, weather, lighting, depth, elevation, obstacles, entrances, and usable structures.
- Initial-position image: frame-zero position, distance, facing, elevation, pose, weapon state, and free movement space.
- Trajectory map: later movement, crossings, attack direction, endpoint, and optional camera path.
- Latest explicit user instruction: final override for the item it changes.

Do not place chat labels such as “图1”, filenames, URLs, or mentions in the formal prompt. When an asset shows only part of the environment, extend visible materials and geometry conservatively; do not invent a new large structure or mechanism.

## Separate Rendering Style from Action Intensity

Classify rendering as live action, 3D cartoon, 3D realistic anime, 2D anime, or another explicit style. Topic labels such as wuxia, science fiction, fantasy, or superhero affect costumes, weapons, environments, and action language but do not replace the rendering class.

Use only two action-intensity levels in the final prompt:

- **Balanced / 均衡**: fast, legible, weighted action with inertia, limited knockback, practical traversal, and proportionate destruction. Default for live action. Documentary realism, limited knockback, or realistic injury remains within this level; tighten distance and damage without making performance slow or inert.
- **Exaggerated / 夸张**: stronger acceleration, displacement, attack lines, afterimages, perspective, knockback, environmental response, and effects. Default for 3D cartoon, 3D realistic anime, and 2D anime.

## Build Each Fighter's Combat Logic

Define for every fighter:

- preferred range;
- approach and escape method;
- primary attack directions and movement amplitude;
- defense, evasion, and counter pattern;
- braking and re-entry after knockback;
- stable effect and ability rules.

Actions must arise from current range, body orientation, weapon position, previous result, opponent response, and available terrain. Do not give unrelated fighters the same generic sequence. Do not add a weapon, limb, or ability that the user did not provide or delegate.

### Combat Carriers

**Melee:** The weapon or body creates contact; footwork, posture, rotation, guard, evasion, and terrain deliver force and change range. Design around real reach and anatomy.

**Ranged:** Show the release action, projectile flight or trace, and hit or evasion result. Build movement around range, cover, approach, and retreat; never reduce the scene to stationary firing.

**Magic:** Define the true trigger—gesture, seal, talisman, staff, weapon, eyes, voice, device, or another established medium—then show formation, travel or expansion, and impact. Keep color, shape, trigger, and energy light consistent. The first use establishes the trigger with a close shot; a major spell repeats the trigger detail, shows the caster in a medium-close shot, then reveals scale, direction, target, release, and result.

**Summon:** Decide whether it is a non-colliding luminous projection or a physical entity with an independent body. Show the actual trigger detail, appearance source, and interaction: mounting, fighting beside the caster, carrying, or synchronized attack. Fixed signature forms such as a spirit avatar or martial soul benefit from a reference asset; a one-use creature may be text-defined.

**Transformation:** Treat it as a state change, not an attack category. Begin from the real origin point with details of eyes, skin, arm, armor, bone, fur, energy veins, or another affected part. Follow the spread direction or tilt upward, widen gradually to a medium shot, and reveal the completed full body last. Preserve the new anatomy, weapon, and ability limits afterward.

Only add chanting or spoken words when the user requests them or the established ability requires them.

## Design Spatial Progression First

Write the fight as a continuous route through real anchors:

- opening zone;
- first crossing;
- first separation or position exchange;
- midpoint impact or route change;
- re-entry from the new position;
- final crossing and endpoint.

Direct-design fights may use stable local choreography or large tracking choreography. Tracking means people and camera progress through a route; it does not mean one unbroken take.

For a tracking fight:

1. Start in motion rather than with a static pose.
2. Keep direction, speed, and landmarks continuous across cuts.
3. Build pursuit causality: flee or reposition, obstruct or counter, overcome, then pursue again.
4. Advance both action density and distance traveled.
5. Tie each camera move to a specific action and destination.
6. Use parallax, foreground objects, footsteps, water, snow, dust, leaves, debris, or terrain change to prove movement.

Use a true one-take only when the user explicitly requests one uninterrupted shot. Then the camera route, occlusion, reframing, and reachable positions must remain physically continuous.

## Build Attack-defense Causality

Every meaningful contact must change at least one of these:

- body state;
- weapon state;
- position or facing;
- speed;
- distance;
- initiative;
- environment.

Write the chain as: attack direction and target → defense, evasion, or counter → contact or miss → immediate body and weapon result → new position and initiative. Avoid repeated attempts that return both fighters to the same state.

Contact should resolve quickly and separate the bodies. After a block, counter immediately. After a hit, let both bodies slide, turn, recoil, separate, or fly along the force direction, then continue from the new position. Avoid prolonged grappling, clinching, repeated grip fighting, or overlapping bodies unless the user explicitly requests ground fighting. A throw should state entry, fulcrum, rotation, landing, and separation once.

## Duration and Pacing

Use a concrete duration, never a range. Do not stretch a short fight by slowing the same action.

### 15-second High-intensity Default

Use this only when the user has not requested documentary realism, a true one-take, pure pursuit, pure defense, teaching demonstration, or an open confrontation.

- Use 6–9 shots of unequal length.
- Begin with approach, attack, evasion, or continuing motion in the first second.
- Use fast exchanges to establish both styles.
- Place an earlier heavy hit in the middle to change the route.
- Follow with immediate braking, re-entry, and initiative exchange.
- Create a distinct final attack with clearer buildup and visible result.
- Default to a visible winner unless the user requests an open ending.

### 30-second High-energy Default

- Use 10–16 shots of unequal length.
- Add real attack-defense developments and two spatial advances; do not stretch the 15-second structure.
- Establish styles quickly, then give one side a temporary advantage.
- Use a midpoint heavy hit to move the fight to another anchor.
- Let the other side adapt with a new range, elevation, terrain use, or allowed combat carrier.
- Establish the final opening through imbalance, disarmament, positional lock, or a clear mistake.
- Give the last strike or major ability a stronger buildup, target lock, release, and result.

Counts are internal density checks, not content to show the user. Custom duration changes shot count, contacts, and anchors according to action-chain completeness.

## Heavy Hits

### Earlier Heavy Hit

Before impact, show at least one readable buildup cue: weight drop or rotation, weapon reset, energy convergence, camera approach, or a brief speed reduction. Keep it short in 15 seconds; 30 seconds may use a separate close shot or brief slow motion.

The connected shot chain must make clear:

1. what opening the previous exchange created;
2. the buildup;
3. attack direction and exact contact point;
4. full-body displacement along the force direction;
5. camera pullback or pursuit revealing distance;
6. environment response at real points of contact;
7. braking and immediate counter-entry.

### Final Heavy Hit or Major Ability

Use a more visible buildup or slow-motion beat than the midpoint hit.

- Melee: opening → body and weapon reset → hand, foot, eye, or weapon detail → full force → high-speed contact → result.
- Spell, ranged attack, or summon: trigger detail → caster medium-close shot → energy and environment response → scale and target direction → release → target result.

Do not repeat the midpoint attack line. Follow the target through flight, fall, containment, engulfment, disarmament, or decisive state change until the final result is visible. End before an empty cooldown or reset pose.

For a decisive 2D-anime finish, default to a high-saturation single-color final frame: remove the real background, choose one dominant color compatible with the attack and palette, preserve character silhouettes and essential design details, spread the result along the attack direction, hold briefly, and end. Do not force this on an open ending or non-decisive separation.

## Assign a Viewing Task to Every Shot

Choose one primary task before framing:

- **Relation shot:** distance, orientation, attack axis, encirclement, or scale.
- **Character shot:** one fighter's approach, casting, shooting, evasion, reaction, buildup, transformation, or injury.
- **Detail shot:** trigger, gesture, eye, foot, weapon, device, body change, or contact point.
- **Result shot:** knockback, projectile hit, spell result, fall, summon landing, or destruction.

Use wide and extreme-wide shots only when they materially show first spatial setup, large displacement, knockback or fall, relocation, formation change, major ability scale and direction, or final overall result. Distance between fighters alone is not a reason to keep both in a wide shot throughout.

If one wide shot would contain multiple independent complex actions—for example caster trigger, spell formation, opponent sprint, and evasion—split it into causal shots. Except for justified tracking, group reformation, or an explicitly requested long take, do not use three consecutive medium-wide, wide, or extreme-wide shots.

Cut during motion and continue direction, speed, and residual force in the next shot. A single action may cross a cut. Do not make characters restart because the camera changed.

## Allocate Shots by Fight Type

### Ordinary Melee

Both fighters may share more frames during close exchange; do not manufacture solo shots to satisfy a quota. Create variety with side tracking, frontal retreat, low angle, over-shoulder, orbit, close handheld movement, and cuts during action. Use close shots for key initiation, weapon crossing, accurate contact, expression change, and impact reaction. Use solo result or re-entry shots when a fighter leaves the exchange area.

### Ranged versus Melee

Establish distance and obstacles once, then cross-cut:

1. ranged fighter's solo trigger, aim, or cast;
2. attack forming and moving through space;
3. melee fighter's solo sprint, slide, wall step, jump, destruction, or obstruction result.

The ranged fighter tries to preserve distance; the melee fighter continuously closes it. Increase shared close-range frames after entry. Return to cross-cutting when the ranged fighter pushes the melee fighter away.

### Ranged versus Ranged

Do not keep both fighters in every frame. Establish positions and the attack axis, then cross-cut among aim or casting, release, projectile or spell travel, cover changes, evasion, and hit reaction. Preserve left-right direction, gaze, landmarks, and source-to-target orientation.

### Group Fight

Use wides to establish encirclement, depth, and formation change. Focus main action on the protagonist and the current one or two attackers; leave other enemies in foreground, background, or off-screen pressure. Follow a struck enemy's result briefly, then use a whip pan, occlusion cut, or motion match to catch the next attack. Let the protagonist break local parts of the formation before numbers reform and create disadvantage.

### Spell, Summon, and Transformation

Use the first appearance to establish the real trigger. For a major ability: trigger detail → character medium-close action → wide scale and attack direction → opponent reaction or result. For transformation, begin with body details, follow the spread, and reveal the full form last.

## Supernatural Light and Environmental Effects

Magic, supernatural phenomena, summons, spirit forms, and other non-natural forces require a visible energy light matched to the ability, user request, or reference asset. Do not show only ordinary ice, flame, weather, shadow, or debris.

Show the light during the relevant stages: trigger, formation, travel or expansion, impact, and dissipation. It need not dominate every frame, but the power source and continuity must remain legible.

- Ice: ice-blue energy, luminous cracks, crystal-line formation, internal crystal glow, and blue-white travel fragments.
- Fire: red, orange, yellow, or user-specified core and halo.
- Lightning, wind, shadow, talisman, summoning, or cosmic phenomena: establish one stable color, texture, and emission behavior from the supplied design or the most natural palette.
- Summons: source medium, contour light, energy core, portal, shadow, or space response that explains appearance.
- Large phenomena: connect sky, cloud, ground, mist, water, debris, or distant structures with related illumination.

Light must fall believably on the caster, target, ground, fog, particles, and nearby structures. Increase brightness, coverage, and environment response from ordinary ability to escalation to final move. Do not let light, smoke, particles, afterimages, or shockwaves hide anatomy, weapon paths, contact points, or results.

Use environmental material to prove motion and force: water curtain, snow mist, leaves, dust, sparks, stone, glass, or debris. Scale destruction from ordinary actions to midpoint hit to final result. Persist injuries, torn clothing, weapon changes, footprints, cracks, and destruction in later shots.
