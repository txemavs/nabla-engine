/**
 * Bow model bindings shared by every bow in the engine: the headset XRBow (AR and VR) and the
 * held bow on foot (HeldWeapon) build their meshes from the same GLB, node, string triangles
 * and transform, so the bow looks the same everywhere.
 */
import * as THREE from 'three'

export interface BowModelDescription {
  bowNode: string
  arrowNode: string
  stringTriangles: readonly number[]
  bowScale: number
  bowRotationX: number
  bowOffset: readonly number[]
  arrowScale: number
  arrowRotationX: number
  arrowOffset: readonly number[]
}

/** String geometry shared by every bow (bow-local metres): tips, rest nock, arrow lead. */
export const bowString = Object.freeze({ tipY: 0.481, restZ: 0.155, arrowLead: 0.29 })

/** The dynamic string that replaces the GLB's static one: tip, nock, tip. */
export function createBowString(): THREE.Line {
  const line = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(),
      new THREE.Vector3(),
      new THREE.Vector3(),
    ]),
    new THREE.LineBasicMaterial({ color: 0xe8dfce }),
  )
  setBowString(line, new THREE.Vector3(0, 0, bowString.restZ))
  return line
}

/** Move the string's nock point (bow-local); the tips stay. */
export function setBowString(line: THREE.Line, nock: THREE.Vector3): void {
  const attr = line.geometry.getAttribute('position') as THREE.BufferAttribute
  attr.setXYZ(0, 0, -bowString.tipY, bowString.restZ)
  attr.setXYZ(1, nock.x, nock.y, nock.z)
  attr.setXYZ(2, 0, bowString.tipY, bowString.restZ)
  attr.needsUpdate = true
  line.geometry.computeBoundingSphere()
}

/** A bow GLB and how to cut it into the bow (string removed) and one arrow. */
export interface BowModel {
  url: string
  model: BowModelDescription
}

/** Recurve bow by Rectus (CC BY-NC 4.0, assets/library/weapons/recurve-bow/README.md). */
export const recurveBow: BowModel = {
  url: '/library/weapons/recurve-bow/recurve-bow.glb',
  model: {
    bowNode: 'bow_world_bow_0',
    arrowNode: 'arrow_new_arrow_0',
    stringTriangles: [
      860, 861, 862, 863, 864, 865, 866, 867, 868, 869, 870, 871, 872, 873, 874, 875, 876, 877, 878,
      879, 880, 881, 882, 883, 884, 885, 886, 887, 888, 889, 890, 891, 892, 893, 894, 895, 896, 897,
      898, 899, 900, 901, 902, 903, 904, 905, 906, 907, 908, 909, 910, 911, 912, 913, 914, 915, 916,
      917, 918, 919, 920, 921, 922, 923, 924, 925, 926, 927, 928, 929, 930, 931, 932, 933, 934, 935,
      936, 937, 938, 939, 940, 941, 942, 943, 944, 945, 946, 947, 948, 949, 950, 951, 952, 953, 954,
      955, 956, 957, 1038, 1039, 1040, 1041, 1042, 1043, 1044, 1045, 1046, 1047, 1048, 1049, 1050,
      1051, 1052, 1053, 1134, 1135, 1136, 1137, 1138, 1139, 1140, 1141, 1142, 1143, 1144, 1145,
      1146, 1147, 1148, 1149, 1150, 1151, 1152, 1153, 1154, 1155, 1156, 1157, 1158, 1159, 1160,
      1161, 1162, 1163, 1164, 1165, 1166, 1167, 1168, 1169, 1170, 1171, 1172, 1173, 1174, 1175,
      1176, 1177, 1178, 1179, 1180, 1181, 1182, 1183, 1184, 1185, 1186, 1187, 1188, 1189, 1190,
      1191, 1192, 1193, 1194, 1195, 1216, 1217, 1218, 1219, 1220, 1221, 1222, 1223, 1224, 1225,
      1226, 1227, 1228, 1229, 1230, 1231, 1232, 1233, 1234, 1235, 1236, 1237, 1238, 1239, 1240,
      1241, 1242, 1243, 1244, 1245, 1246, 1247,
    ],
    bowScale: 0.016217327430911768,
    bowRotationX: 1.5707963267948966,
    bowOffset: [0, 0, 0.1264951539611118],
    arrowScale: 0.01655690828292472,
    arrowRotationX: 1.5707963267948966,
    arrowOffset: [0, 0, 0.3113036929439351],
  },
}

/**
 * Arco: the engine's own bow (original model, assets/library/weapons/arco/README.md). Authored in
 * engine metres and axes (grip at the origin, +Y up, -Z to the target, string at +Z), so no cut
 * or transform; its `Bow_String` node is unused (the engine draws the string).
 */
export const arcoBow: BowModel = {
  url: '/library/weapons/arco/arco.glb',
  model: {
    bowNode: 'Bow',
    arrowNode: 'Arrow',
    stringTriangles: [],
    bowScale: 1,
    bowRotationX: 0,
    bowOffset: [0, 0, 0],
    arrowScale: 1,
    arrowRotationX: 0,
    arrowOffset: [0, 0, 0],
  },
}

/** The bow web (held, slot 4) and XR use unless a host names another. */
export const defaultBow: BowModel = arcoBow

/** Bindings by id, as named by a held bow preset's `bowModel`. */
export const bowModels: Readonly<Record<string, BowModel>> = {
  arco: arcoBow,
  'recurve-bow': recurveBow,
}

/**
 * The bow (its static string triangles removed) and one arrow, cloned out of `asset` and
 * oriented, scaled and offset as `options` says. `asset` is left untouched.
 */
export function buildBowModel(
  asset: THREE.Object3D,
  options: BowModelDescription,
): { bow: THREE.Mesh; arrow: THREE.Mesh } {
  if (
    options.bowOffset.length !== 3 ||
    options.arrowOffset.length !== 3 ||
    ![
      options.bowScale,
      options.arrowScale,
      options.bowRotationX,
      options.arrowRotationX,
      ...options.bowOffset,
      ...options.arrowOffset,
    ].every(Number.isFinite) ||
    options.bowScale <= 0 ||
    options.arrowScale <= 0
  )
    throw new RangeError('Invalid bow model transform')
  const bowSource = asset.getObjectByName(options.bowNode),
    arrowSource = asset.getObjectByName(options.arrowNode)
  if (!(bowSource instanceof THREE.Mesh) || !(arrowSource instanceof THREE.Mesh))
    throw new Error('Bow/arrow nodes missing from GLB')
  const clone = (source: THREE.Mesh) =>
    new THREE.Mesh(
      source.geometry.clone(),
      Array.isArray(source.material)
        ? source.material.map((m) => m.clone())
        : source.material.clone(),
    )
  const bow = clone(bowSource)
  const geometry = bow.geometry,
    indices = geometry.getIndex()
  if (indices) {
    const hidden = new Set(options.stringTriangles)
    geometry.setIndex(Array.from(indices.array).filter((_, i) => !hidden.has(Math.floor(i / 3))))
  }
  const scale = options.bowScale
  geometry
    .rotateX(options.bowRotationX)
    .scale(scale, scale, scale)
    .translate(options.bowOffset[0], options.bowOffset[1], options.bowOffset[2])
  geometry.computeBoundingBox()
  geometry.computeBoundingSphere()
  const arrow = clone(arrowSource)
  const arrowScale = options.arrowScale
  arrow.geometry
    .rotateX(options.arrowRotationX)
    .scale(arrowScale, arrowScale, arrowScale)
    .translate(options.arrowOffset[0], options.arrowOffset[1], options.arrowOffset[2])
  arrow.geometry.computeBoundingSphere()
  bow.userData.bowModelPart = arrow.userData.bowModelPart = true
  return { bow, arrow }
}
