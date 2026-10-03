class_name TowerArt
extends RefCounted

static var models: Dictionary = {}

static func material(color: Color, glow: float = 0.0, metallic: float = 0.0) -> StandardMaterial3D:
	var m = StandardMaterial3D.new()
	m.albedo_color = color
	m.metallic = metallic
	m.roughness = 0.3 if metallic > 0 else 0.65
	m.emission_enabled = glow > 0
	m.emission = color
	m.emission_energy_multiplier = glow
	return m

static func mesh(parent: Node3D, geometry: Mesh, pos: Vector3, mat: Material) -> MeshInstance3D:
	var n = MeshInstance3D.new()
	n.mesh = geometry
	n.material_override = mat
	n.position = pos
	parent.add_child(n)
	return n

static func box(parent: Node3D, size: Vector3, pos: Vector3, mat: Material) -> MeshInstance3D:
	var geometry = BoxMesh.new()
	geometry.size = size
	return mesh(parent, geometry, pos, mat)

static func cone(parent: Node3D, radius: float, height: float, pos: Vector3, mat: Material) -> MeshInstance3D:
	var geometry = CylinderMesh.new()
	geometry.top_radius = 0
	geometry.bottom_radius = radius
	geometry.height = height
	geometry.radial_segments = 8
	return mesh(parent, geometry, pos, mat)

static func ring(parent: Node3D, radius: float, pos: Vector3, mat: Material) -> MeshInstance3D:
	var geometry = TorusMesh.new()
	geometry.inner_radius = radius - 0.05
	geometry.outer_radius = radius + 0.05
	geometry.rings = 32
	geometry.ring_segments = 8
	return mesh(parent, geometry, pos, mat)

static func model(asset: String, height: float) -> Node3D:
	var path_name = "res://assets/" + asset + ".glb"
	if not models.has(path_name):
		models[path_name] = load(path_name)
	var n: Node3D = models[path_name].instantiate()
	var bounds = _bounds(n, Transform3D.IDENTITY)
	if bounds.size.y > 0.001:
		n.scale *= height / bounds.size.y
		n.position.y = -bounds.position.y * n.scale.y
	return n

static func _bounds(n: Node3D, parent_transform: Transform3D) -> AABB:
	var t = parent_transform * n.transform
	var out = AABB()
	if n is MeshInstance3D:
		out = t * n.get_aabb()
	for child in n.get_children():
		if child is Node3D:
			var b = _bounds(child, t)
			if b.size.length() > 0:
				out = b if out.size.length() == 0 else out.merge(b)
	return out

static func tint(n: Node, mat: Material) -> void:
	if n is MeshInstance3D:
		n.material_override = mat
	for child in n.get_children():
		tint(child, mat)

static func monster(kind: String, height: float) -> Node3D:
	var root = Node3D.new()
	var body = model("character-orc", height)
	body.rotation.y = PI
	root.add_child(body)
	var rocky = ShaderMaterial.new()
	rocky.shader = load("res://shaders/obsidian.gdshader")
	tint(body, rocky)
	var fire = material(Color("ff742b"), 2.5)
	var elite = kind in ["tank", "brute", "warlock", "boss", "finalBoss"]
	for side in [-1, 1]:
		var horn = cone(root, height * 0.055, height * (0.22 if elite else 0.13), Vector3(side * height * 0.16, height * 0.99, 0), rocky)
		horn.rotation.z = -side * 0.35
		box(root, Vector3(height * 0.05, height * 0.035, 0.035), Vector3(side * height * 0.08, height * 0.84, -height * 0.17), fire)
		box(root, Vector3(0.035, height * 0.26, 0.025), Vector3(side * height * 0.09, height * 0.5, -height * 0.13), fire)
	var gem = SphereMesh.new()
	gem.radius = height * 0.06
	gem.height = height * 0.12
	mesh(root, gem, Vector3(0, height * 0.55, -height * 0.16), fire)
	if elite:
		for side in [-1, 1]:
			cone(root, height * 0.075, height * 0.23, Vector3(side * height * 0.21, height * 0.71, 0), rocky)
	if kind == "finalBoss":
		for side in [-1, 1]:
			var spike = cone(root, height * 0.12, height * 0.4, Vector3(side * height * 0.28, height * 0.68, 0.1), rocky)
			spike.rotation.z = -side * 0.7
		var armor = material(Color("74624a"), 0.05, 0.9)
		for side in [-1, 1]:
			var plate = box(root, Vector3(height * 0.19, height * 0.05, height * 0.2), Vector3(side * height * 0.22, height * 0.67, 0), armor)
			plate.rotation.z = side * 0.25
			for j in range(3):
				cone(root, height * 0.025, height * (0.1 + j * 0.025), Vector3(side * height * 0.22, height * 0.72, (j - 1) * height * 0.06), armor)
		var light = OmniLight3D.new()
		light.light_color = Color("ff8438")
		light.light_energy = 2.0
		light.omni_range = 11
		light.position = Vector3(0, height * 0.55, -height * 0.18)
		root.add_child(light)
	if elite:
		var embers = GPUParticles3D.new()
		embers.amount = 24
		embers.lifetime = 2.5
		embers.position.y = height * 0.5
		var process = ParticleProcessMaterial.new()
		process.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
		process.emission_box_extents = Vector3(height * 0.18, height * 0.3, height * 0.15)
		process.direction = Vector3.UP
		process.spread = 20
		process.initial_velocity_min = 0.5
		process.initial_velocity_max = 1.5
		process.gravity = Vector3(0, 0.1, 0)
		process.scale_min = 0.02
		process.scale_max = 0.07
		embers.process_material = process
		var spark = SphereMesh.new()
		spark.radius = 1
		spark.height = 2
		spark.radial_segments = 4
		spark.rings = 2
		spark.material = fire
		embers.draw_pass_1 = spark
		root.add_child(embers)
	return root

static func label(parent: Node3D, text: String, pos: Vector3, color: Color = Color("d6f5ff")) -> Label3D:
	var n = Label3D.new()
	n.text = text
	n.position = pos
	n.font_size = 40
	n.pixel_size = 0.006
	n.modulate = color
	n.billboard = BaseMaterial3D.BILLBOARD_ENABLED
	parent.add_child(n)
	return n
