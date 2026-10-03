class_name TowerMonster
extends CharacterBody3D

var game
var def: Dictionary
var kind: String
var stage = 1
var home: Dictionary
var hp = 50.0
var max_hp = 50.0
var model: Node3D
var animator: AnimationPlayer
var state = "idle"
var timer = 0.0
var burn_time = 0.0
var burn_damage = 0.0
var slow_time = 0.0
var phase = 1
var dead = false
var attack_kind = "melee"
var health: Label3D
var climber = false
var hop_time = 0.0
var hop_start = Vector3.ZERO
var hop_target = Vector3.ZERO
var hop_home: Dictionary = {}

func setup(g, sp: Dictionary) -> void:
	game = g
	kind = sp.type
	stage = int(sp.stage)
	def = TowerBalance.data.zombies[kind]
	home = g.platform_data[int(sp.platformId)]
	max_hp = float(def.hp) * (1.0 + 0.18 * (stage - 1)) * g.difficulty_hp()
	hp = max_hp
	position = Vector3(sp.x, sp.y + 0.05, sp.z)
	collision_layer = 2
	collision_mask = 1
	var shape = CapsuleShape3D.new()
	shape.radius = float(def.radius)
	shape.height = float(def.height)
	var collider = CollisionShape3D.new()
	collider.shape = shape
	collider.position.y = float(def.height) * 0.5
	add_child(collider)
	model = TowerArt.monster(kind, float(def.height))
	add_child(model)
	animator = TowerHero.find_animation(model)
	health = TowerArt.label(self, "", Vector3(0, float(def.height) + 0.8, 0), Color("ffb66b"))
	health.font_size = 32
	health.pixel_size = 0.008
	floor_snap_length = 0.2
	add_to_group("monsters")

func is_final() -> bool:
	return kind == "finalBoss"

func take_damage(damage: float, w: Dictionary = {}) -> void:
	if dead or (is_final() and not game.final_battle):
		return
	hp -= damage
	game.floater(position + Vector3.UP * float(def.height), str(int(damage)), Color("fff2b0"))
	if not w.is_empty():
		if int(w.rarity) >= 2:
			burn_time = 3.0
			burn_damage = TowerBalance.damage(w) * 0.08
		if w.kind == "whip":
			slow_time = 1.6
		var delta = position - game.hero.position
		delta.y = 0
		velocity += delta.normalized() * float(TowerBalance.data.weapons[w.kind].knockback) * (1.0 - float(def.knockResist))
	if hp <= 0:
		dead = true
		collision_layer = 0
		game.monster_killed(self, w)
		var tween = create_tween()
		tween.tween_property(model, "rotation:x", -1.5, 0.7)
		tween.tween_callback(queue_free)

func reset_battle() -> void:
	hp = max_hp
	phase = 1
	position = Vector3(home.x, home.maxY + 0.05, home.z)
	velocity = Vector3.ZERO
	timer = 0
	state = "idle"
	burn_time = 0
	slow_time = 0

func play_animation(anim: String) -> void:
	if animator:
		for name in animator.get_animation_list():
			if String(name).ends_with(anim) and animator.current_animation != name:
				animator.play(name, 0.1)
				return

func _physics_process(dt: float) -> void:
	if not game or game.state != "play" or dead:
		return
	visible = climber or abs(stage - game.band_stage) <= 1
	if not visible or (is_final() and not game.final_battle):
		return
	if burn_time > 0:
		burn_time -= dt
		take_damage(burn_damage * dt)
		if dead:
			return
	slow_time = maxf(0, slow_time - dt)
	if climber and _climb(dt):
		return
	if is_final() and phase == 1 and hp <= max_hp * 0.5:
		phase = 2
		game.toast("이그니스 폭주! 화염탄과 충격파를 피하세요!")
		game.ring(position, 6, Color("ff5835"), 1)
	var delta = game.hero.position - position
	var distance = Vector2(delta.x, delta.z).length()
	var desired = Vector3.ZERO
	var can_chase = not game.safe and distance < 22 and abs(delta.y) < 6
	if state == "windup":
		timer -= dt
		if timer <= 0:
			resolve_attack(distance)
	elif state == "cooldown":
		timer -= dt
		if timer <= 0:
			state = "idle"
	elif can_chase:
		var reach = 13.0 if is_final() else 11.0 if def.get("ranged", false) else float(def.attackRange)
		if distance < reach and is_on_floor():
			state = "windup"
			timer = float(def.windup)
			attack_kind = "volley" if is_final() and distance > 5.8 else "slam" if def.get("boss", false) else "ranged" if def.get("ranged", false) else "melee"
			if attack_kind == "slam":
				game.ring(position, 5.8, Color("ff5d43"), timer)
			play_animation("attack-melee-right")
		else:
			delta.y = 0
			desired = delta.normalized() * float(def.speed) * (1.25 if phase == 2 else 1.0) * (0.55 if slow_time > 0 else 1.0)
	# Guardians stay on their own platform; the summit boss cannot fall out of its encounter.
	if position.x + desired.x * dt < home.minX + 0.7 or position.x + desired.x * dt > home.maxX - 0.7:
		desired.x = 0
	if position.z + desired.z * dt < home.minZ + 0.7 or position.z + desired.z * dt > home.maxZ - 0.7:
		desired.z = 0
	velocity.x = move_toward(velocity.x, desired.x, dt * 30)
	velocity.z = move_toward(velocity.z, desired.z, dt * 30)
	velocity.y = maxf(-32, velocity.y - dt * 30)
	move_and_slide()
	if is_final() and position.y < float(home.maxY) - 1:
		position.y = home.maxY + 0.05
		velocity.y = 0
	if desired.length() > 0.1:
		model.rotation.y = atan2(-desired.x, -desired.z)
		play_animation("walk")
	elif state != "windup":
		play_animation("idle")
	health.text = "" if is_final() else "%s · %s" % [def.name, int(hp)] if def.get("boss", false) or def.get("elite", false) else str(int(hp)) if hp < max_hp else ""

func _climb(dt: float) -> bool:
	if game.safe or position.y < game.lava_y:
		queue_free()
		return true
	if hop_time > 0:
		hop_time = maxf(0, hop_time - dt)
		var t = 1.0 - hop_time / 0.85
		var body = game.world.bodies[int(hop_home.id)]
		hop_target = body.position + Vector3.UP * (float(hop_home.hy) + 0.05)
		position = hop_start.lerp(hop_target, t) + Vector3.UP * sin(t * PI) * 3.5
		model.rotation.y = atan2(hop_start.x - hop_target.x, hop_start.z - hop_target.z)
		play_animation("jump")
		if hop_time <= 0:
			home = hop_home
			velocity = Vector3.ZERO
		return true
	if game.hero.last_ground <= int(home.id):
		return false
	var index = game.map_data.platforms.find(home)
	if index < 0 or index + 1 >= game.map_data.platforms.size():
		return false
	var next = game.map_data.platforms[index + 1]
	if next.type in ["safe", "sanctuary", "arena"]:
		queue_free()
		return true
	hop_start = position
	hop_home = next
	hop_time = 0.85
	return true

func resolve_attack(distance: float) -> void:
	state = "cooldown"
	timer = float(def.cooldown) / (1.35 if phase == 2 else 1.0)
	if game.safe:
		return
	var damage = float(def.dmg) * (1.0 + 0.1 * (stage - 1))
	if attack_kind == "volley" or attack_kind == "ranged":
		var count = 5 if phase == 2 else 3 if attack_kind == "volley" else 1
		for i in range(count):
			game.projectile(position + Vector3.UP * 1.6, game.hero.position + Vector3.UP + Vector3((i - count / 2.0) * 0.6, 0, 0), damage)
	elif attack_kind == "slam":
		game.ring(position, 5.8, Color("ffab48"), 0.6)
		if distance < 5.8 and abs(game.hero.position.y - position.y) < 1.1:
			game.hero.hurt(damage, position, 11)
	elif distance < float(def.attackRange) + 0.5:
		game.hero.hurt(damage, position)
