extends RefCounted

func check(condition: bool, message: String) -> void:
	if not condition:
		push_error("VERIFY_FAIL: " + message)
		assert(condition, message)

func run(g) -> void:
	var before = g.save.duplicate(true)
	check(TowerBalance.data.rarities.size() == 7, "seven rarities")
	check(TowerBalance.odds(10)[6] >= 28, "top-tier loot chance")
	check(TowerBalance.cost(g.current_weapon()) == 8, "cheap upgrade")
	var legacy = TowerSave.normalize({"v": 1, "lastSafe": 4, "weapons": [{"uid": 1, "kind": "rifle", "rarity": 3, "level": 4, "ammo": 0}]})
	check(legacy.weapons[0].rarity == 4 and not legacy.weapons[0].has("ammo"), "legacy legendary and ammo migration")
	check(legacy.resumeSafe == 4, "legacy floor migration")
	var repaired = TowerSave.normalize({"weapons": [{"uid": 7, "kind": "rifle", "rarity": 99, "level": -5}, {"kind": "invalid"}, null], "equipped": [999, 7, 7], "nextUid": 2})
	check(repaired.weapons.size() == 1 and repaired.nextUid == 8 and repaired.equipped == [null, 7, null], "invalid imported inventory repaired")
	g.start_game()
	g.save.coins = 5000
	for i in range(10):
		check(g.upgrade(1), "upgrade all ten levels")
	check(not g.upgrade(1), "max upgrade enforced")
	check(g.hero.weapon_key.ends_with(":10"), "upgraded appearance refresh")
	var coins = g.save.coins
	g.land(int(g.map_data.safeIds[1]))
	check(g.save.coins == coins + 200, "floor reward")
	g.land(int(g.map_data.safeIds[1]))
	check(g.save.coins == coins + 200, "floor reward is one-time")
	g.state = "paused"
	check(not g.restart_floor(2), "locked floor rejected")
	check(g.restart_floor(0), "unlocked floor restart")
	check(g.save.lastSafe == 1 and g.save.resumeSafe == 0, "highest floor preserved")
	g.save.lastSafe = 9
	g.land(int(g.map_data.sanctuaryId))
	check(g.save.bossSanctuaryUnlocked and g.safe and g.hero.hp == 100, "pre-boss sanctuary saves and heals")
	g.land(int(g.map_data.safeIds[10]))
	check(not g.save.cleared and g.checkpoint_id == int(g.map_data.sanctuaryId), "cannot skip final boss")
	var boss = null
	for mob in g.get_tree().get_nodes_in_group("monsters"):
		if mob.is_final():
			boss = mob
	check(boss != null, "summit boss spawned")
	var hp = boss.hp
	boss.take_damage(100)
	check(boss.hp == hp, "cannot snipe final boss from safety")
	g.land(int(g.map_data.finalArenaId))
	check(g.final_battle, "final battle starts on arena")
	boss.take_damage(boss.max_hp * 0.55)
	boss._physics_process(0.01)
	check(boss.phase == 2, "final boss second phase")
	g.die()
	g.respawn()
	check(g.safe and g.checkpoint_id == int(g.map_data.sanctuaryId) and boss.hp == boss.max_hp, "boss retry resets to sanctuary")
	g.land(int(g.map_data.finalArenaId))
	boss.take_damage(boss.max_hp + 1)
	check(g.save.finalBossDefeated, "boss victory persisted")
	g.land(int(g.map_data.safeIds[10]))
	check(g.state == "clear" and g.save.cleared and g.save.lastSafe == 10, "victory requires boss defeat")
	for kind in ["pistol", "rifle", "shotgun"]:
		check(not TowerBalance.data.weapons[kind].has("mag"), "unlimited ammo " + kind)
	for tower in g.maps:
		check(tower.platforms.size() > 350, "full tower layout")
		var index = -1
		for i in range(tower.platforms.size()):
			if int(tower.platforms[i].id) == int(tower.sanctuaryId):
				index = i
		check(index >= 0 and int(tower.platforms[index + 1].id) == int(tower.finalArenaId), "sanctuary directly precedes final boss")
		check(not tower.zombies.any(func(z): return int(z.platformId) == int(tower.sanctuaryId)), "sanctuary free of enemies")
	# Exercise actual native physics and held inputs, including the gun ray collision.
	g.state = "play"
	g.reset_to(int(g.map_data.safeIds[0]))
	for i in range(60):
		await g.get_tree().physics_frame
	check(g.hero.is_on_floor(), "native floor collision")
	var grounded_y = g.hero.position.y
	Input.action_press("jump")
	for i in range(18):
		await g.get_tree().physics_frame
	Input.action_release("jump")
	check(g.hero.position.y > grounded_y + 1.0, "native keyboard jump")
	g.reset_to(int(g.map_data.safeIds[0]))
	g.yaw = 0
	var start = g.hero.position
	Input.action_press("forward")
	for i in range(24):
		await g.get_tree().physics_frame
	Input.action_release("forward")
	check(g.hero.position.distance_to(start) > 0.8, "native keyboard movement")
	g.reset_to(int(g.map_data.safeIds[0]))
	var p = g.platform_data[int(g.map_data.safeIds[0])]
	var target = TowerMonster.new()
	g.add_child(target)
	target.setup(g, {"type": "walker", "stage": 1, "platformId": p.id, "x": p.x, "y": p.maxY, "z": p.z + 4})
	target.max_hp = 1000000
	target.hp = target.max_hp
	g.save.weapons[0].kind = "rifle"
	g.save.weapons[0].level = 0
	g.refresh_weapon()
	for i in range(4):
		await g.get_tree().physics_frame
	var hp_before = target.hp
	Input.action_press("attack")
	for i in range(180):
		await g.get_tree().physics_frame
	Input.action_release("attack")
	check(target.hp < hp_before - TowerBalance.damage(g.current_weapon()) * 5, "held attack fires repeatedly and hits native collider")
	for kind in ["pistol", "rifle", "shotgun"]:
		g.save.weapons[0].kind = kind
		for i in range(80):
			g.attack_cooldown = 0
			g.fire()
		check(not g.current_weapon().has("ammo"), "firing beyond magazine has no ammunition limit")
	target.queue_free()
	g.state = "paused"
	var blinking: Dictionary = {}
	var collapsing: Dictionary = {}
	for platform in g.map_data.platforms:
		if platform.get("blink") and blinking.is_empty():
			blinking = platform
		if platform.type == "falling" and collapsing.is_empty():
			collapsing = platform
	g.band_stage = int(blinking.stage)
	g.time = float(blinking.blink.on) + float(blinking.blink.warn) * 0.5 - float(blinking.blink.offset) + float(blinking.blink.T)
	g.world.update_world(0)
	check(g.world.bodies[int(blinking.id)].collision_layer == 1, "blink warning remains solid")
	g.time += float(blinking.blink.warn)
	g.world.update_world(0)
	check(g.world.bodies[int(blinking.id)].collision_layer == 0, "blink off is not solid")
	g.falling[int(collapsing.id)] = 4.5
	g.world.update_world(0.01)
	check(not g.falling.has(int(collapsing.id)) and g.world.bodies[int(collapsing.id)].collision_layer == 1, "collapsed platform returns for retry")
	g.save = before
	print("VERIFY_OK: native movement, jumping, continuous gunfire, progression, economy, migration, weapon appearance, locked floors, boss phases, retry, victory, and four complete towers")
	g.get_tree().quit()
