class_name FrostWorld
extends Node3D

var game
var bodies: Dictionary = {}
var stage_groups: Array[Node3D] = []
var ice: ShaderMaterial
var sun: DirectionalLight3D
var snow: GPUParticles3D
var lava: MeshInstance3D
var lava_material: ShaderMaterial
var hazard_nodes: Array = []
var ice_spires: Array = []
var frozen_floor: StaticBody3D

func setup(g) -> void:
	game = g
	ice = ShaderMaterial.new()
	ice.shader = load("res://shaders/ice.gdshader")
	_build_environment()
	for floor_number in range(11):
		var group = Node3D.new()
		add_child(group)
		stage_groups.append(group)
	for p in g.map_data.platforms:
		_build_platform(p)
	for stage in range(1, 11):
		_build_castle(stage)
	_build_hazards()
	lava_material = ShaderMaterial.new()
	lava_material.shader = load("res://shaders/lava.gdshader")
	var plane = PlaneMesh.new()
	plane.size = Vector2(180, 180)
	plane.subdivide_width = 64
	plane.subdivide_depth = 64
	lava = TowerArt.mesh(self, plane, Vector3(0, -14, 0), lava_material)
	frozen_floor = StaticBody3D.new()
	frozen_floor.collision_layer = 0
	var frozen_shape = CollisionShape3D.new()
	var slab = BoxShape3D.new()
	slab.size = Vector3(180, 0.6, 180)
	frozen_shape.shape = slab
	frozen_floor.add_child(frozen_shape)
	add_child(frozen_floor)

func _build_environment() -> void:
	var node = WorldEnvironment.new()
	var env = Environment.new()
	var sky = Sky.new()
	var sky_material = ProceduralSkyMaterial.new()
	sky_material.sky_top_color = Color("17263f")
	sky_material.sky_horizon_color = Color("91c7df")
	sky_material.ground_bottom_color = Color("172436")
	sky_material.ground_horizon_color = Color("6b9ebc")
	sky_material.sun_angle_max = 8
	sky.sky_material = sky_material
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.7
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.fog_enabled = true
	env.fog_light_color = Color("80a5c6")
	env.fog_density = 0.006
	if RenderingServer.get_current_rendering_method() != "gl_compatibility":
		env.glow_enabled = true
		env.glow_intensity = 0.6
		env.ssao_enabled = true
		env.ssao_intensity = 1.5
		env.volumetric_fog_enabled = true
		env.volumetric_fog_density = 0.005
	node.environment = env
	add_child(node)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-55, -30, 0)
	sun.light_color = Color("d4e8ff")
	sun.light_energy = 1.1
	sun.shadow_enabled = true
	sun.directional_shadow_max_distance = 70
	add_child(sun)
	var rim = DirectionalLight3D.new()
	rim.rotation_degrees = Vector3(-20, 145, 0)
	rim.light_color = Color("63bdf8")
	rim.light_energy = 0.45
	add_child(rim)
	snow = GPUParticles3D.new()
	snow.amount = 500
	snow.lifetime = 12
	snow.visibility_aabb = AABB(Vector3(-45, -25, -45), Vector3(90, 70, 90))
	var particles = ParticleProcessMaterial.new()
	particles.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
	particles.emission_box_extents = Vector3(40, 18, 40)
	particles.direction = Vector3(0.3, -1, 0.1)
	particles.spread = 12
	particles.initial_velocity_min = 1.2
	particles.initial_velocity_max = 2.2
	particles.gravity = Vector3(0.12, -0.06, 0)
	particles.scale_min = 0.025
	particles.scale_max = 0.065
	snow.process_material = particles
	var flake = SphereMesh.new()
	flake.radius = 1
	flake.height = 2
	flake.radial_segments = 4
	flake.rings = 2
	flake.material = TowerArt.material(Color("d6f6ff"), 0.4)
	snow.draw_pass_1 = flake
	add_child(snow)

func _build_platform(p: Dictionary) -> void:
	var body = AnimatableBody3D.new()
	body.sync_to_physics = true
	body.position = Vector3(p.x, p.y, p.z)
	body.set_meta("platform_id", int(p.id))
	body.collision_layer = 1
	body.collision_mask = 0
	stage_groups[int(p.stage)].add_child(body)
	bodies[int(p.id)] = body
	var shape = BoxShape3D.new()
	shape.size = Vector3(p.hx * 2, p.hy * 2, p.hz * 2)
	var collider = CollisionShape3D.new()
	collider.shape = shape
	body.add_child(collider)
	TowerArt.box(body, shape.size, Vector3.ZERO, ice)
	var trim = TowerArt.material(Color("7ddbf0"), 0.4, 0.6)
	for side in [-1, 1]:
		TowerArt.box(body, Vector3(p.hx * 1.9, 0.05, 0.08), Vector3(0, p.hy + 0.005, side * p.hz * 0.9), trim)
	if p.type == "safe" or p.type == "sanctuary":
		_safe_props(body, p)
	elif p.type == "checkpoint":
		TowerArt.label(body, "저장 지점", Vector3(0, 1.8, 0))
	elif p.type == "arena":
		TowerArt.ring(body, 6.8, Vector3(0, p.hy + 0.04, 0), TowerArt.material(Color("ff7857"), 2))
		for x in [-1, 1]:
			for z in [-1, 1]:
				var column = TowerArt.model("column", 4)
				column.position = Vector3(x * 6.6, p.hy, z * 6.6)
				body.add_child(column)
				TowerArt.tint(column, ice)
	if p.get("belt"):
		TowerArt.label(body, "→ → →", Vector3(0, p.hy + 0.1, 0), Color("ffde87"))

func _safe_props(body: Node3D, p: Dictionary) -> void:
	var height = float(p.hy)
	var prep = p.type == "sanctuary"
	var forge = TowerArt.model("wood-support", 1.3)
	forge.position = Vector3(3.2, height, 1)
	body.add_child(forge)
	TowerArt.box(body, Vector3(1.5, 0.3, 0.8), Vector3(3.2, height + 0.95, 1), TowerArt.material(Color("719ac2"), 0, 0.85))
	TowerArt.label(body, "대장간", Vector3(3.2, height + 2.4, 1), Color("ffde9b"))
	if int(p.safe.stage) > 0 and not prep:
		var chest = TowerArt.model("chest", 1.3)
		chest.position = Vector3(-3.2, height, 0)
		body.add_child(chest)
		TowerArt.label(body, "보물상자", Vector3(-3.2, height + 2.2, 0), Color("ffdc85"))
	var station = TowerArt.model("potion", 1.0)
	station.position = Vector3(0, height, 3.2)
	body.add_child(station)
	TowerArt.label(body, "회복 · 물대포 충전", Vector3(0, height + 2, 3.2))
	var title = "최종 보스 직전 · 저장 완료" if prep else "출발" if int(p.safe.stage) == 0 else "%s층 안전구역" % int(p.safe.stage)
	TowerArt.label(body, title, Vector3(0, height + 3.5, -3))
	for side in [-1, 1]:
		var rock = TowerArt.model("rocks", 2.3)
		rock.position = Vector3(side * (p.hx - 0.7), height, -p.hz + 0.7)
		body.add_child(rock)
		TowerArt.tint(rock, ice)

func _build_castle(stage: int) -> void:
	var p = game.platform_data[int(game.map_data.safeIds[stage - 1])]
	var top = game.platform_data[int(game.map_data.safeIds[stage])]
	var y_base = float(p.maxY)
	var height = float(top.maxY) - y_base
	var group = stage_groups[stage]
	for i in range(20):
		var angle = i * TAU / 20.0
		var at = Vector3(sin(angle) * 37, y_base + height * 0.5, cos(angle) * 37)
		var wall = TowerArt.box(group, Vector3(11.5, height + 1, 1.4), at, ice)
		wall.rotation.y = angle
		var buttress = TowerArt.model("column", height)
		buttress.position = Vector3(sin(angle) * 35.8, y_base, cos(angle) * 35.8)
		buttress.scale.x *= 2
		buttress.scale.z *= 2
		group.add_child(buttress)
		TowerArt.tint(buttress, ice)
		if i % 2 == 0:
			var window = TowerArt.model("dungeon-gate", 6)
			window.position = Vector3(sin(angle) * 35.7, y_base + 5, cos(angle) * 35.7)
			window.rotation.y = angle
			group.add_child(window)
			TowerArt.tint(window, TowerArt.material(Color("638ead"), 0, 0.45))
			var glass = TowerArt.box(group, Vector3(3.8, 5, 0.05), window.position + Vector3(0, 2.5, 0), TowerArt.material(Color("8addee"), 0.7))
			glass.rotation.y = angle
			for k in range(3):
				var icicle = TowerArt.cone(group, 0.3, 1.7 + k * 0.5, window.position + Vector3(k - 1.0, 7.3, 0), ice)
				icicle.rotation.z = PI
	var crystal_mat = TowerArt.material(Color("69cde9"), 1.1, 0.35)
	for i in range(5):
		var angle = i * TAU / 5
		var crystal = TowerArt.cone(group, 1.0, 6, Vector3(sin(angle) * 8, y_base + 4, cos(angle) * 8), crystal_mat)
		ice_spires.append(crystal)
	TowerArt.label(group, "%sF · 얼음 성채" % stage, Vector3(p.x, y_base + 10, p.z))

func _build_hazards() -> void:
	for h in game.map_data.hazards:
		var p = game.platform_data[int(h.platformId)]
		var root = Node3D.new()
		root.position = Vector3(p.x, p.maxY, p.z)
		stage_groups[int(h.stage)].add_child(root)
		if h.kind == "spinner":
			TowerArt.box(root, Vector3(h.len, 0.25, 0.3), Vector3(0, 0.5, 0), TowerArt.material(Color("ed916c"), 0.5, 0.5))
		else:
			for v in h.vents:
				var flame = TowerArt.cone(root, 0.45, 3.3, Vector3(v.dx, 1.65, v.dz), TowerArt.material(Color("ff7832"), 2))
				flame.visible = false
		hazard_nodes.append({"node": root, "def": h})

func update_world(dt: float) -> void:
	for i in range(11):
		stage_groups[i].visible = abs(i - game.band_stage) <= 1
	snow.position = game.hero.position + Vector3.UP * 15
	lava.position.y = game.lava_y
	frozen_floor.position.y = game.lava_y - 0.3
	frozen_floor.collision_layer = 1 if game.freeze_time > 0 else 0
	lava_material.set_shader_parameter("frozen", 1.0 if game.freeze_time > 0 else 0.0)
	for id in bodies:
		var p = game.platform_data[id]
		var body = bodies[id]
		if p.get("motion"):
			var motion = p.motion
			var axis = {"x": 0, "y": 1, "z": 2}[motion.axis]
			body.position[axis] = float(p["b" + motion.axis]) + float(motion.amp) * sin(game.time * TAU / float(motion.period) + float(motion.phase))
		if p.get("blink"):
			var blink = p.blink
			var t = fmod(game.time + float(blink.offset), float(blink.T))
			var solid = t < float(blink.on) + float(blink.warn)
			var warning = t >= float(blink.on) and solid
			body.collision_layer = 1 if solid else 0
			body.visible = solid and stage_groups[int(p.stage)].visible and (not warning or sin(game.time * 35) > -0.5)
		if game.falling.has(id):
			game.falling[id] += dt
			var t = float(game.falling[id])
			if t > 0.55:
				body.position.y = float(p.by) - 12 * pow(t - 0.55, 2)
				body.collision_layer = 0
			if t >= 4.5:
				body.position.y = float(p.by)
				body.collision_layer = 1
				game.falling.erase(id)
	for item in hazard_nodes:
		var h = item.def
		var root = item.node
		if abs(int(h.stage) - game.band_stage) > 1:
			continue
		if h.kind == "spinner":
			root.rotation.y = float(h.phase) + game.time * float(h.speed) * int(h.dir)
			var point = root.to_local(game.hero.position)
			if not game.safe and abs(point.y - 0.5) < 0.65 and abs(point.z) < 0.5 and abs(point.x) < float(h.len) / 2:
				game.hero.hurt(15, root.global_position)
		else:
			for i in range(h.vents.size()):
				var v = h.vents[i]
				var on = fmod(game.time + float(v.phase), 3.4) > 2.4
				root.get_child(i).visible = on
				var delta = game.hero.position - root.global_position - Vector3(v.dx, 0, v.dz)
				if on and not game.safe and Vector2(delta.x, delta.z).length() < 0.8 and delta.y < 3.3:
					game.hero.hurt(18, root.global_position)
