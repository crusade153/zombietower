shader_type spatial;
render_mode specular_schlick_ggx;
uniform vec4 rock_color : source_color = vec4(0.075, 0.055, 0.095, 1.0);
varying vec3 local_pos;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
float noise(vec3 p) {
	vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
	return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void vertex() { local_pos = VERTEX; }
void fragment() {
	vec3 p = local_pos * 9.0;
	float n = noise(p) * 0.7 + noise(p * 2.1) * 0.3;
	float seam = 1.0 - smoothstep(0.008, 0.045, abs(n - 0.52));
	float pulse = 0.8 + 0.2 * sin(TIME * 2.0 + local_pos.y * 5.0);
	ALBEDO = rock_color.rgb * (0.6 + n) + seam * vec3(0.32, 0.05, 0.008);
	METALLIC = 0.55;
	ROUGHNESS = 0.35 + n * 0.4;
	EMISSION = seam * vec3(2.6, 0.34, 0.015) * pulse;
	NORMAL_MAP = vec3(0.5 + (noise(p * 2.0) - 0.5) * 0.25, 0.5 + (noise(p.zxy * 2.0) - 0.5) * 0.25, 1.0);
}
