shader_type spatial;
render_mode unshaded;
uniform float frozen = 0.0;
varying vec3 world_pos;
void vertex() { world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; VERTEX.y += sin(VERTEX.x * 0.25 + TIME) * cos(VERTEX.z * 0.3 + TIME * 0.7) * 0.08; }
void fragment() {
	vec2 p = world_pos.xz * 0.4;
	float n = sin(p.x + sin(p.y + TIME * 0.2)) * sin(p.y * 1.5 + cos(p.x * 0.7 + TIME * 0.15));
	float cracks = 1.0 - smoothstep(0.04, 0.2, abs(n));
	vec3 fire = mix(vec3(0.025, 0.008, 0.012), vec3(1.0, 0.14, 0.004), cracks);
	ALBEDO = mix(fire, vec3(0.3, 0.7, 0.9), frozen);
	EMISSION = mix(cracks * vec3(0.8, 0.05, 0.001), vec3(0.05, 0.18, 0.25), frozen);
}
