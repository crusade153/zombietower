class_name TowerHero
extends CharacterBody3D

var game
var model: Node3D
var animator: AnimationPlayer
var weapon_mount: Node3D
var hp = 100.0
var invulnerable = 0.0
var attack_time = 0.0
var coyote = 0.0
var jump_buffer = 0.0
var weapon_key = ""
var last_ground = -1
var knockback = Vector3.ZERO

func setup(g) -> void:
	game = g
	collision_layer = 4
	collision_mask = 1
	var collision = CollisionShape3D.new()
	var shape = BoxShape3D.new()
	shape.size = Vector3(0.8, 1.8, 0.8)
	collision.shape = shape
	collision.position.y = 0.9
	add_child(collision)
	model = Node3D.new()
	add_child(model)
	var imported = TowerArt.model("character-human", 1.8)
	model.add_child(imported)
	animator = find_animation(model)
	weapon_mount = Node3D.new()
	weapon_mount.position = Vector3(0.43, 1.0, 0.08)
	model.add_child(weapon_mount)
	floor_snap_length = 0.15
	floor_stop_on_slope = true

static func find_animation(root: Node) -> AnimationPlayer:
	if root is AnimationPlayer:
		return root
	for child in root.get_children():
		var result = find_animation(child)
		if result:
			return result
	return null

func play_animation(anim: String) -> void:
	if not animator:
		return
	for key in animator.get_animation_list():
		if String(key).get_file() == anim or String(key).ends_with(anim):
			if animator.current_animation != key:
				animator.play(key, 0.12)
			return

func equip(w: Dictionary) -> void:
	if w.is_empty():
		return
	var key = "%s:%s:%s" % [w.kind, w.rarity, w.level]
	if key == weapon_key:
		return
	weapon_key = key
	for child in weapon_mount.get_children():
		child.queue_free()
	var scene: PackedScene = load("res://assets/weapons/%s-%s.glb" % [w.kind, TowerBalance.tier(int(w.level))])
	var mesh: Node3D = scene.instantiate()
	mesh.scale *= 1.0 + int(w.level) * 0.008
	mesh.rotation.x = -PI / 2
	weapon_mount.add_child(mesh)
	var color = Color(TowerBalance.data.rarities[int(w.rarity)].color)
	var badge = TowerArt.ring(weapon_mount, 0.13, Vector3(0, 0.08, 0), TowerArt.material(color, 1.8))
	badge.rotation.x = PI / 2

func reset_at(pos: Vector3, direction: Vector3) -> void:
	position = pos + Vector3.UP * 0.06
	velocity = Vector3.ZERO
	knockback = Vector3.ZERO
	hp = 100.0
	invulnerable = 1.2
	coyote = 0
	jump_buffer = 0
	last_ground = -1
	model.rotation.y = atan2(direction.x, direction.z)

func hurt(damage: float, origin: Vector3, strength: float = 7.0) -> void:
	if invulnerable > 0 or game.safe or game.state != "play":
		return
	hp -= damage
	invulnerable = 0.9
	knockback = (position - origin).normalized() * strength
	knockback.y = 3.0
	game.floater(position + Vector3.UP * 2, "-%s" % int(damage), Color("ff7082"))
	game.sound(180, 0.1)
	if hp <= 0:
		game.die()

func _physics_process(dt: float) -> void:
	if game == null or game.state != "play":
		return
	invulnerable = maxf(0, invulnerable - dt)
	attack_time = maxf(0, attack_time - dt)
	var axes = Input.get_vector("left", "right", "back", "forward") + game.touch_move
	if axes.length() > 1:
		axes = axes.normalized()
	var front = Vector3(sin(game.yaw), 0, cos(game.yaw))
	var side = Vector3(-front.z, 0, front.x)
	var desired = (front * axes.y + side * axes.x) * 7.0
	var acceleration = 90.0 if is_on_floor() else 40.0
	velocity.x = move_toward(velocity.x, desired.x, acceleration * dt)
	velocity.z = move_toward(velocity.z, desired.z, acceleration * dt)
	if Input.is_action_just_pressed("jump") or game.touch_jump:
		jump_buffer = 0.12
		game.touch_jump = false
	else:
		jump_buffer -= dt
	coyote = 0.12 if is_on_floor() else coyote - dt
	if coyote > 0 and jump_buffer > 0:
		velocity.y = 12.0
		coyote = 0
		jump_buffer = 0
		game.sound(520, 0.06)
		game.ring(position, 0.8, Color("b3f8ff"), 0.25)
	velocity.y = maxf(-32, velocity.y - 30.0 * dt)
	knockback = knockback.move_toward(Vector3.ZERO, dt * 30)
	velocity += knockback * dt * 8
	move_and_slide()
	if desired.length() > 0.5 and attack_time <= 0:
		model.rotation.y = lerp_angle(model.rotation.y, atan2(desired.x, desired.z), dt * 14)
	var ground_id = -1
	for i in range(get_slide_collision_count()):
		var hit = get_slide_collision(i)
		if hit.get_normal().y > 0.5 and hit.get_collider().has_meta("platform_id"):
			ground_id = int(hit.get_collider().get_meta("platform_id"))
	if ground_id >= 0:
		if ground_id != last_ground:
			game.land(ground_id)
		last_ground = ground_id
		game.step_on(ground_id)
	if attack_time > 0:
		play_animation("holding-right-shoot" if TowerBalance.data.weapons[game.current_weapon().kind].kind == "gun" else "attack-melee-right")
	elif not is_on_floor():
		play_animation("jump" if velocity.y > 0 else "fall")
	else:
		play_animation("sprint" if desired.length() > 0.5 else "idle")
	weapon_mount.rotation.x = sin(attack_time * 22.0) * 0.6
	if position.y < game.lava_y + 0.15 and game.freeze_time <= 0:
		game.die()
	elif position.y < game.checkpoint_position().y - 30:
		game.die()
