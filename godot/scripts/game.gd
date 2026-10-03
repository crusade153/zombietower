extends Node3D

var save: Dictionary
var maps: Array
var map_data: Dictionary
var platform_data: Dictionary = {}
var world: FrostWorld
var hero: TowerHero
var camera: Camera3D
var ui
var audio: AudioStreamPlayer
var state = "title"
var band_stage = 0
var safe = true
var safe_index = 0
var checkpoint_id = 0
var active_safe_id = 0
var slot = 0
var time = 0.0
var yaw = 0.0
var pitch = 0.36
var lava_y = -14.0
var lava_delay = 0.0
var freeze_time = 0.0
var water = 2
var water_cooldown = 0.0
var stage_coins = 0
var final_battle = false
var attack_cooldown = 0.0
var death_time = 0.0
var kills = 0
var deaths = 0
var falling: Dictionary = {}
var pickups: Array = []
var projectiles: Array = []
var touch_move = Vector2.ZERO
var touch_jump = false
var touch_attack = false
var rng = RandomNumberGenerator.new()
var autosave = 0.0
var camera_drag_time = -10.0
var verify_mode = false
var climber_timer = 20.0
var climber_announced: Dictionary = {}

func _ready() -> void:
	rng.randomize()
	save = TowerSave.load_game()
	verify_mode = "--verify" in OS.get_cmdline_user_args() or "--capture" in OS.get_cmdline_user_args()
	if verify_mode:
		save = TowerSave.fresh()
	maps = JSON.parse_string(FileAccess.get_file_as_string("res://data/towers.json"))
	_bind_inputs()
	camera = Camera3D.new()
	camera.fov = 62
	camera.far = 900
	add_child(camera)
	camera.current = true
	audio = AudioStreamPlayer.new()
	add_child(audio)
	ui = preload("res://scripts/interface.gd").new()
	add_child(ui)
	ui.setup(self)
	build_world()
	ui.title()
	if "--verify" in OS.get_cmdline_user_args():
		call_deferred("_verify")
	elif "--capture" in OS.get_cmdline_user_args():
		call_deferred("_capture")

func _bind_inputs() -> void:
	var actions = {"forward": [KEY_W, KEY_UP], "back": [KEY_S, KEY_DOWN], "left": [KEY_A, KEY_LEFT], "right": [KEY_D, KEY_RIGHT], "jump": [KEY_SPACE], "attack": [KEY_J], "water": [KEY_Q], "pause": [KEY_ESCAPE, KEY_P], "forge": [KEY_E], "chest": [KEY_F], "slot1": [KEY_1], "slot2": [KEY_2], "slot3": [KEY_3]}
	for action in actions:
		if not InputMap.has_action(action):
			InputMap.add_action(action)
		for key in actions[action]:
			var event = InputEventKey.new()
			event.physical_keycode = key
			InputMap.action_add_event(action, event)

func build_world() -> void:
	if world:
		remove_child(world)
		world.queue_free()
	if hero:
		remove_child(hero)
		hero.queue_free()
	for mob in get_tree().get_nodes_in_group("monsters"):
		mob.queue_free()
	for item in pickups:
		if is_instance_valid(item.node):
			item.node.queue_free()
	for item in projectiles:
		if is_instance_valid(item.node):
			item.node.queue_free()
	pickups.clear()
	projectiles.clear()
	falling.clear()
	map_data = maps[0]
	for entry in maps:
		if int(entry.seed) == int(save.seed):
			map_data = entry
	platform_data.clear()
	for p in map_data.platforms:
		platform_data[int(p.id)] = p
	hero = TowerHero.new()
	add_child(hero)
	hero.setup(self)
	world = FrostWorld.new()
	add_child(world)
	world.setup(self)
	for sp in map_data.zombies:
		if sp.type == "finalBoss" and save.finalBossDefeated:
			continue
		var mob = TowerMonster.new()
		add_child(mob)
		mob.setup(self, sp)
	for c in map_data.aircoins:
		_spawn_pickup("coin", Vector3(c.x, c.y, c.z), int(c.value), int(c.stage))
	for p in map_data.pickups:
		_spawn_pickup(p.type, Vector3(p.x, p.y + 0.9, p.z), 35 if p.type == "heal" else 1, int(p.stage))
	water = 2
	slot = 0
	reset_to(int(map_data.sanctuaryId) if save.resumeAtBoss else int(map_data.safeIds[int(save.resumeSafe)]))
	refresh_weapon()

func difficulty_hp() -> float:
	return {"easy": 0.8, "normal": 1.0, "hard": 1.3}.get(save.difficulty, 1.0) * (1.0 + int(save.loop) * 0.6)

func checkpoint_position() -> Vector3:
	var p = platform_data[checkpoint_id]
	return Vector3(p.x, p.maxY, p.z)

func reset_to(id: int) -> void:
	for mob in get_tree().get_nodes_in_group("monsters"):
		if mob.climber:
			mob.queue_free()
	climber_timer = 20.0
	var p = platform_data[id]
	hero.reset_at(Vector3(p.x, p.maxY, p.z), Vector3(p.next.x, 0, p.next.z))
	checkpoint_id = id
	active_safe_id = id
	safe = p.type in ["safe", "sanctuary"]
	safe_index = int(p.safe.stage) if p.has("safe") and p.type != "sanctuary" else 9 if p.type == "sanctuary" else safe_index
	band_stage = int(p.stage)
	lava_y = float(p.maxY) - 14
	lava_delay = 6
	freeze_time = 0
	water = maxi(2, water)
	water_cooldown = 0
	stage_coins = 0
	attack_cooldown = 0
	final_battle = false
	yaw = atan2(float(p.next.x), float(p.next.z))
	_update_camera(1.0)

func start_game(new_game: bool = false) -> void:
	if new_game:
		var muted = save.muted
		var difficulty = save.difficulty
		save = TowerSave.fresh()
		save.muted = muted
		save.difficulty = difficulty
		save.seed = maps[rng.randi_range(0, maps.size() - 1)].seed
		build_world()
		persist()
	state = "play"
	ui.close()
	refresh_weapon()
	toast("최종 보스 앞에서 이어서!" if save.resumeAtBoss else "얼음 성채에 오신 것을 환영합니다!")

func new_tower() -> void:
	save.loop = int(save.loop) + 1
	save.seed = maps[rng.randi_range(0, maps.size() - 1)].seed
	save.lastSafe = 0
	save.resumeSafe = 0
	save.resumeAtBoss = false
	save.bossSanctuaryUnlocked = false
	save.finalBossDefeated = false
	save.cleared = false
	save.openedChests = []
	persist()
	build_world()
	start_game()

func restart_floor(floor_number: int, boss_prep: bool = false) -> bool:
	if not state in ["paused", "title"] or floor_number < 0 or floor_number > int(save.lastSafe):
		return false
	if boss_prep and not save.bossSanctuaryUnlocked:
		return false
	save.resumeSafe = floor_number
	save.resumeAtBoss = boss_prep
	reset_to(int(map_data.sanctuaryId) if boss_prep else int(map_data.safeIds[floor_number]))
	_clear_projectiles()
	for mob in get_tree().get_nodes_in_group("monsters"):
		if mob.is_final() and not mob.dead:
			mob.reset_battle()
	persist()
	start_game()
	return true

func persist() -> void:
	if not verify_mode:
		TowerSave.write(save)

func pause_game() -> void:
	if state == "play":
		state = "paused"
		touch_move = Vector2.ZERO
		touch_attack = false
		persist()
		ui.pause_menu()

func land(id: int) -> void:
	var p = platform_data[id]
	if p.type == "sanctuary":
		safe = true
		checkpoint_id = id
		active_safe_id = id
		hero.hp = 100
		water = 2
		freeze_time = 0
		final_battle = false
		save.bossSanctuaryUnlocked = true
		save.resumeAtBoss = true
		save.resumeSafe = 9
		persist()
		toast("최종 보스 직전 저장 완료! E로 강화, 다음 발판에서 결전")
	elif p.type == "safe":
		var floor_number = int(p.safe.stage)
		if floor_number == 10 and not save.finalBossDefeated:
			reset_to(int(map_data.sanctuaryId))
			toast("최종 보스를 처치해야 정상에 도착할 수 있습니다!")
			return
		safe = true
		for mob in get_tree().get_nodes_in_group("monsters"):
			if mob.climber:
				mob.queue_free()
		checkpoint_id = id
		active_safe_id = id
		safe_index = floor_number
		hero.hp = 100
		water = maxi(water, 2)
		stage_coins = 0
		save.resumeSafe = floor_number
		save.resumeAtBoss = false
		if floor_number > int(save.lastSafe):
			save.lastSafe = floor_number
			save.best = maxi(int(save.best), floor_number)
			var reward = 150 + floor_number * 50
			save.coins += reward
			toast("%s층 클리어! +%s 코인" % [floor_number, reward])
			confetti(hero.position)
		if floor_number == 10:
			save.cleared = true
			state = "clear"
			ui.clear_menu()
		persist()
	else:
		if safe:
			lava_delay = 6
		safe = false
		band_stage = int(p.stage)
		if id == int(map_data.finalArenaId):
			final_battle = not save.finalBossDefeated
			checkpoint_id = int(map_data.sanctuaryId)
			toast("최종 결전 · 용암 군주 이그니스")
		elif p.get("checkpoint", false):
			checkpoint_id = id
			toast("체크포인트 도착")
	band_stage = int(p.stage)

func step_on(id: int) -> void:
	var p = platform_data[id]
	if p.type == "falling" and not falling.has(id):
		falling[id] = 0.0
	if p.get("belt"):
		hero.velocity.x += float(p.belt.x) * 0.08
		hero.velocity.z += float(p.belt.z) * 0.08

func die() -> void:
	if state != "play":
		return
	state = "dead"
	death_time = 1.6
	deaths += 1
	var loss = int(stage_coins * 0.1)
	save.coins = maxi(0, int(save.coins) - loss)
	touch_attack = false
	hero.play_animation("die")
	toast("쓰러졌습니다 · 체크포인트에서 부활")
	sound(90, 0.3)

func respawn() -> void:
	reset_to(checkpoint_id)
	_clear_projectiles()
	for mob in get_tree().get_nodes_in_group("monsters"):
		if mob.is_final() and not mob.dead:
			mob.reset_battle()
	for id in falling:
		var p = platform_data[id]
		world.bodies[id].position.y = p.by
		world.bodies[id].collision_layer = 1
	falling.clear()
	state = "play"
	refresh_weapon()

func current_weapon() -> Dictionary:
	return TowerSave.weapon(save, save.equipped[slot])

func refresh_weapon() -> void:
	if current_weapon().is_empty():
		for i in range(3):
			if save.equipped[i] != null:
				slot = i
				break
	hero.equip(current_weapon())

func upgrade(uid: int) -> bool:
	var w = TowerSave.weapon(save, uid)
	if w.is_empty() or int(w.level) >= 10 or int(save.coins) < TowerBalance.cost(w):
		return false
	save.coins -= TowerBalance.cost(w)
	w.level = int(w.level) + 1
	refresh_weapon()
	confetti(hero.position)
	ring(hero.position, 1.5, Color("ffe06a"), 0.6)
	sound(880, 0.1)
	persist()
	return true

func equip(uid: int, index: int) -> void:
	var old = save.equipped.find(uid)
	if old >= 0:
		save.equipped[old] = save.equipped[index]
	save.equipped[index] = uid
	refresh_weapon()
	persist()

func sell_weapon(uid: int) -> void:
	if save.weapons.size() <= 1:
		return
	var w = TowerSave.weapon(save, uid)
	if w.is_empty():
		return
	save.coins += TowerBalance.sell_price(w)
	save.weapons.erase(w)
	for i in range(3):
		if save.equipped[i] == uid:
			save.equipped[i] = null
	if save.equipped.filter(func(value): return value != null).is_empty():
		save.equipped[0] = save.weapons[0].uid
	refresh_weapon()
	persist()

func open_chest() -> Dictionary:
	if not safe or safe_index == 0 or platform_data[active_safe_id].type == "sanctuary" or save.openedChests.has(safe_index):
		return {}
	var w = TowerBalance.roll(safe_index, rng, safe_index in [5, 10])
	save.openedChests.append(safe_index)
	if save.weapons.size() >= 12:
		save.coins += int(TowerBalance.data.economy.sellValue[int(w.rarity)])
		w.uid = -1
	else:
		w.uid = int(save.nextUid)
		save.nextUid += 1
		save.weapons.append(w)
		var empty = save.equipped.find(null)
		if empty >= 0:
			save.equipped[empty] = w.uid
	persist()
	sound(960, 0.2)
	return w

func fire() -> void:
	var w = current_weapon()
	if w.is_empty() or attack_cooldown > 0:
		return
	var d = TowerBalance.data.weapons[w.kind]
	attack_cooldown = float(d.interval)
	hero.attack_time = 0.3
	var target: TowerMonster = null
	var nearest = INF
	for mob in get_tree().get_nodes_in_group("monsters"):
		if mob.dead or (mob.is_final() and not final_battle) or abs(mob.position.y - hero.position.y) > 5:
			continue
		var distance = hero.position.distance_to(mob.position)
		if distance < float(d.range) + float(mob.def.radius) and distance < nearest:
			target = mob
			nearest = distance
	var origin = hero.position + Vector3.UP * 1.2
	var direction = Vector3(sin(hero.model.rotation.y), 0, cos(hero.model.rotation.y))
	if target:
		direction = (target.position + Vector3.UP * float(target.def.height) * 0.5 - origin).normalized()
		hero.model.rotation.y = atan2(direction.x, direction.z)
	var damage = TowerBalance.damage(w)
	if d.kind == "gun":
		for pellet in range(int(d.get("pellets", 1))):
			var ray = direction.rotated(Vector3.UP, deg_to_rad(rng.randf_range(-float(d.spread), float(d.spread))))
			var query = PhysicsRayQueryParameters3D.create(origin, origin + ray * float(d.range), 3)
			var hit = get_world_3d().direct_space_state.intersect_ray(query)
			var end = hit.position if not hit.is_empty() else origin + ray * float(d.range)
			tracer(origin, end)
			if not hit.is_empty() and hit.collider is TowerMonster:
				hit.collider.take_damage(damage, w)
		sound(120 if w.kind == "shotgun" else 240, 0.045)
	else:
		var count = 0
		for mob in get_tree().get_nodes_in_group("monsters"):
			var delta = mob.position - hero.position
			var distance = delta.length()
			if mob.dead or abs(delta.y) > 2.8 or distance > float(d.range) + float(mob.def.radius):
				continue
			if direction.dot(delta.normalized()) < cos(deg_to_rad(float(d.get("arc", 50))) * 0.5):
				continue
			mob.take_damage(damage, w)
			count += 1
			if count >= int(d.maxTargets):
				break
		ring(hero.position + direction, float(d.range) * 0.4, Color("d5f8ff"), 0.2)
		sound(360, 0.065)

func monster_killed(mob: TowerMonster, w: Dictionary) -> void:
	kills += 1
	var coins = int(round(float(mob.def.coin) * 6 * (1.0 + (mob.stage - 1) * 0.25) * (1.15 if not w.is_empty() and int(w.rarity) >= 1 else 1.0)))
	# Credit directly so loot cannot fall into the lava and disappear.
	save.coins += coins
	stage_coins += coins
	floater(mob.position + Vector3.UP, "+%s 코인" % coins, Color("ffe38c"))
	if not w.is_empty() and int(w.rarity) >= 3:
		hero.hp = minf(100, hero.hp + 6)
	if mob.is_final():
		save.finalBossDefeated = true
		final_battle = false
		toast("이그니스 격파! 다음 안전구역으로 이동해 성채를 해방하세요!")
		confetti(mob.position)
		persist()

func use_water() -> void:
	if safe or water <= 0 or water_cooldown > 0 or freeze_time > 0:
		return
	water -= 1
	freeze_time = 6
	water_cooldown = 3
	toast("물대포! 용암이 6초 동안 굳었습니다")
	ring(hero.position, 4, Color("95eaff"), 1)

func _spawn_pickup(kind: String, pos: Vector3, value: int, stage: int) -> void:
	var node = TowerArt.model("coin" if kind == "coin" else "potion", 0.55)
	node.position = pos
	add_child(node)
	pickups.append({"type": kind, "node": node, "origin": pos, "value": value, "stage": stage, "taken": false})

func projectile(origin: Vector3, target: Vector3, damage: float) -> void:
	var ball = SphereMesh.new()
	ball.radius = 0.24
	ball.height = 0.48
	var node = TowerArt.mesh(self, ball, origin, TowerArt.material(Color("ff732d"), 3))
	projectiles.append({"node": node, "velocity": (target - origin).normalized() * 12, "life": 3.0, "damage": damage})

func _clear_projectiles() -> void:
	for p in projectiles:
		p.node.queue_free()
	projectiles.clear()

func _physics_process(dt: float) -> void:
	if state != "play":
		return
	time += dt
	world.update_world(dt)
	attack_cooldown = maxf(0, attack_cooldown - dt)
	water_cooldown = maxf(0, water_cooldown - dt)
	freeze_time = maxf(0, freeze_time - dt)
	if safe or final_battle or save.finalBossDefeated and band_stage == 10:
		lava_y = move_toward(lava_y, checkpoint_position().y - 14, dt * 7)
	elif freeze_time <= 0:
		lava_delay -= dt
		if lava_delay <= 0:
			var difficulty = {"easy": 0.85, "normal": 1.0, "hard": 1.15}.get(save.difficulty, 1.0)
			lava_y += (0.5 + max(0, band_stage - 1) * 0.035) * difficulty * (1.6 if hero.position.y - lava_y > 26 else 1) * dt
	update_climbers(dt)
	if Input.is_action_pressed("attack") or touch_attack:
		fire()
	if Input.is_action_just_pressed("water"):
		use_water()
	for i in range(3):
		if Input.is_action_just_pressed("slot%s" % (i + 1)) and save.equipped[i] != null:
			slot = i
			refresh_weapon()
	if safe and Input.is_action_just_pressed("forge"):
		ui.forge()
	if safe and Input.is_action_just_pressed("chest"):
		ui.chest()
	for item in pickups:
		if item.taken:
			continue
		item.node.visible = abs(int(item.stage) - band_stage) <= 1
		if not item.node.visible:
			continue
		item.node.rotation.y += dt * 3
		item.node.position.y = item.origin.y + sin(time * 3 + item.origin.x) * 0.15
		if hero.position.distance_to(item.node.position - Vector3.UP * 0.9) < 1.6:
			if item.type == "coin":
				save.coins += item.value
				stage_coins += item.value
			elif item.type == "heal":
				if hero.hp >= 100:
					continue
				hero.hp = minf(100, hero.hp + item.value)
			else:
				if water >= 3:
					continue
				water += 1
			item.taken = true
			item.node.hide()
			sound(720, 0.05)
	for i in range(projectiles.size() - 1, -1, -1):
		var p = projectiles[i]
		p.life -= dt
		p.node.position += p.velocity * dt
		if p.node.position.distance_to(hero.position + Vector3.UP) < 0.8:
			hero.hurt(p.damage, p.node.position)
			p.life = 0
		if p.life <= 0:
			p.node.queue_free()
			projectiles.remove_at(i)
	autosave += dt
	if autosave > 4:
		autosave = 0
		persist()

func update_climbers(dt: float) -> void:
	if safe or final_battle or band_stage < 2 or lava_delay > 0 or freeze_time > 0:
		return
	climber_timer -= dt
	if climber_timer > 0:
		return
	climber_timer = maxf(16, 38 - band_stage * 2.4)
	var active = get_tree().get_nodes_in_group("monsters").filter(func(m): return m.climber and not m.dead).size()
	var spawn: Dictionary = {}
	for p in map_data.platforms:
		if p.type in ["safe", "sanctuary", "arena", "falling", "blink"] or p.get("motion"):
			continue
		if p.maxY > lava_y + 1.2 and p.maxY < lava_y + 7 and p.maxY < hero.position.y - 8:
			spawn = p
	if spawn.is_empty():
		return
	for i in range(mini(5 - active, 1 + band_stage / 3)):
		var mob = TowerMonster.new()
		add_child(mob)
		mob.setup(self, {"type": "runner" if rng.randf() < 0.4 else "walker", "stage": band_stage, "platformId": spawn.id, "x": spawn.x, "y": spawn.maxY, "z": spawn.z})
		mob.climber = true
	if not climber_announced.has(band_stage):
		climber_announced[band_stage] = true
		toast("용암 괴물 무리가 아래에서 올라옵니다!")

func _process(dt: float) -> void:
	if hero == null:
		return
	if state == "dead":
		death_time -= dt
		if death_time <= 0:
			respawn()
	if state == "title":
		yaw += dt * 0.08
	_update_camera(dt)
	ui.update_hud()

func _update_camera(dt: float) -> void:
	if state == "play" and (Input.is_action_pressed("forward") or touch_move.y > 0) and time - camera_drag_time > 1.3 and platform_data.has(hero.last_ground):
		var hint = platform_data[hero.last_ground].next
		yaw = lerp_angle(yaw, atan2(float(hint.x), float(hint.z)), minf(1, dt * 1.6))
	var center = hero.position + Vector3.UP * 1.5
	var distance = 10.5 if final_battle else 8.5
	var desired = center - Vector3(sin(yaw), 0, cos(yaw)) * cos(pitch) * distance + Vector3.UP * sin(pitch) * distance
	camera.position = camera.position.lerp(desired, minf(1, dt * 10))
	camera.look_at(center + Vector3.UP * 0.2)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		if state == "play":
			pause_game()
		elif state == "paused":
			state = "play"
			ui.close()
	if state == "play" and event is InputEventMouseMotion and Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT):
		camera_drag_time = time
		yaw -= event.relative.x * 0.006
		pitch = clampf(pitch + event.relative.y * 0.005, 0.1, 1.2)
	if state == "play" and event is InputEventScreenDrag and event.position.x > get_viewport().get_visible_rect().size.x * 0.45:
		camera_drag_time = time
		yaw -= event.relative.x * 0.006
		pitch = clampf(pitch + event.relative.y * 0.005, 0.1, 1.2)

func toast(text: String) -> void:
	ui.toast(text)

func floater(pos: Vector3, text: String, color: Color) -> void:
	var node = TowerArt.label(self, text, pos, color)
	node.font_size = 36
	var tween = create_tween().set_parallel(true)
	tween.tween_property(node, "position:y", pos.y + 1.2, 0.8)
	tween.tween_property(node, "modulate:a", 0.0, 0.8)
	tween.chain().tween_callback(node.queue_free)

func ring(pos: Vector3, radius: float, color: Color, duration: float) -> void:
	var node = TowerArt.ring(self, radius, pos + Vector3.UP * 0.04, TowerArt.material(color, 1.5))
	var tween = create_tween()
	tween.tween_property(node, "scale", Vector3.ONE * 1.15, duration)
	tween.tween_callback(node.queue_free)

func tracer(from: Vector3, to: Vector3) -> void:
	var length = from.distance_to(to)
	var node = TowerArt.box(self, Vector3(0.025, 0.025, maxf(0.02, length)), (from + to) * 0.5, TowerArt.material(Color("ffdf82"), 3))
	node.look_at(to)
	get_tree().create_timer(0.08).timeout.connect(node.queue_free)

func confetti(pos: Vector3) -> void:
	for i in range(12):
		var color = Color.from_hsv(rng.randf(), 0.6, 1)
		var node = TowerArt.box(self, Vector3(0.08, 0.16, 0.03), pos + Vector3.UP, TowerArt.material(color, 0.4))
		var end = pos + Vector3(rng.randf_range(-3, 3), rng.randf_range(1, 3), rng.randf_range(-3, 3))
		var tween = create_tween()
		tween.tween_property(node, "position", end, 0.8)
		tween.tween_callback(node.queue_free)

func sound(frequency: float, duration: float) -> void:
	if save.muted or verify_mode:
		return
	var samples = int(duration * 22050)
	var bytes = PackedByteArray()
	bytes.resize(samples * 2)
	for i in range(samples):
		var envelope = 1.0 - float(i) / samples
		bytes.encode_s16(i * 2, int(sin(i * TAU * frequency / 22050) * 3600 * envelope))
	var stream = AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.data = bytes
	audio.stream = stream
	audio.play()

func _verify() -> void:
	await get_tree().process_frame
	await preload("res://tests/verify.gd").new().run(self)

func _capture() -> void:
	start_game()
	await get_tree().create_timer(2).timeout
	await RenderingServer.frame_post_draw
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://artifacts"))
	get_viewport().get_texture().get_image().save_png("res://artifacts/godot-play.png")
	reset_to(int(map_data.sanctuaryId))
	await get_tree().create_timer(1).timeout
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://artifacts/godot-boss-sanctuary.png")
	var arena = platform_data[int(map_data.finalArenaId)]
	hero.reset_at(Vector3(arena.x, arena.maxY, arena.z + 4), Vector3(0, 0, -1))
	yaw = PI
	land(int(arena.id))
	await get_tree().create_timer(1).timeout
	state = "paused"
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png("res://artifacts/godot-final-boss.png")
	print("CAPTURE_OK")
	get_tree().quit()
