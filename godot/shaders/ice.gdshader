shader_type spatial;
render_mode specular_schlick_ggx;
uniform vec4 ice_color : source_color = vec4(0.35, 0.63, 0.85, 1.0);
varying vec3 world_pos;
varying vec3 world_normal;
float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1,311.7,74.7))) * 43758.5453); }
float noise(vec3 p) {
	vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
	return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);
}
void vertex() { world_pos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz; world_normal = MODEL_NORMAL_MATRIX * NORMAL; }
void fragment() {
	vec3 p = world_pos;
	float vein = abs(sin(p.x * 2.3 + sin(p.z * 1.5) + p.y * 0.7));
	float detail = noise(p * 13.0);
	float frost = smoothstep(0.6, 0.95, world_normal.y) * (0.3 + 0.7 * noise(p * 1.6));
	float crack = 1.0 - smoothstep(0.01, 0.035, vein);
	ALBEDO = mix(ice_color.rgb, vec3(0.85, 0.94, 1.0), frost * 0.65);
	ALBEDO += crack * vec3(0.06, 0.1, 0.12) + (detail - 0.5) * 0.07;
	METALLIC = 0.18;
	ROUGHNESS = mix(0.16, 0.85, frost) + detail * 0.06;
	EMISSION = ice_color.rgb * crack * 0.25;
	NORMAL_MAP = vec3(0.5 + (noise(p * 8.0) - 0.5) * 0.1, 0.5 + (noise(p.zxy * 8.0) - 0.5) * 0.1, 1.0);
}
