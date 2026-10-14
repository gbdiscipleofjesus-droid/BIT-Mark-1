#!/usr/bin/env python3
"""
Robit 3D-printable body (Pixel-style biped), parametric.   Units: millimetres.
Run:  python3 robit_body.py     -> writes stl/*.stl, previews/*.png and prints a fit report.

World frame:  X = left/right,  Y = front (+Y is where Robit looks),  Z = up.  Z = 0 is the bottom of the torso floor.
Everything you may need to change is in the PARAMETERS block. PRINT THE FIT TEST FIRST (stl/00_fit_test.stl).
"""
import os, math, itertools
import numpy as np
import trimesh
from manifold3d import Manifold

# ============================================================ PARAMETERS (measure your parts with calipers!)
# --- MG90S servo (local frame: x = long axis, y = width, z = shaft axis, z=0 is the back of the servo)
SV_L, SV_W, SV_H = 22.8, 12.2, 22.7      # body length, width, height (without ears, boss and shaft)
SV_EAR_L, SV_EAR_T = 32.5, 2.5           # total length with ears, ear thickness
SV_EAR_Z = 15.9                          # distance from the back of the servo to the lower face of the ears
SV_HOLE_SP, SV_HOLE_D = 27.8, 2.0        # ear hole spacing / diameter
SV_SHAFT_X = 5.5                         # shaft position from body centre along the long axis
SV_BOSS_D, SV_BOSS_H = 11.8, 4.0         # round boss around the shaft
HORN_T = 2.0                             # thickness of the servo horn you use
CL = 0.35                                # clearance added around parts that must slide in (0.3-0.4 for most printers)
# --- Waveshare ESP32-S3-Touch-LCD-1.85 (documented size 55 x 55 mm)
BOARD_W = 55.0
BOARD_T = 12.0                           # thickness incl. parts on the back
GLASS_D = 48.5                           # window diameter in the front (1.85" round glass = 47 mm)
# --- other parts
PCA_L, PCA_W = 62.5, 25.4                # PCA9685 board
BATT_L, BATT_W, BATT_T = 40.0, 30.0, 6.5 # LiPo 503040 (change to yours)
SPK_L, SPK_W, SPK_T = 30.0, 20.0, 4.5    # 2030 speaker
M2_PILOT = 1.7                           # hole for M2 self-tapping screws in plastic
M2_CLEAR = 2.4
# --- design
HIP_X = 22.0                             # hip axes are at x = +-HIP_X
TW = 3.0                                 # wall thickness
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)))
SEG = 40

# ============================================================ helpers
def box(sx, sy, sz, c=(0, 0, 0)):
    return Manifold.cube([sx, sy, sz], True).translate(list(c))

def cyl(d, h, c=(0, 0, 0), axis="z", seg=SEG):
    m = Manifold.cylinder(h, d / 2, d / 2, seg, True)
    if axis == "x": m = m.rotate([0, 90, 0])
    if axis == "y": m = m.rotate([90, 0, 0])
    return m.translate(list(c))

def union(ms):
    ms = [m for m in ms if m is not None]
    return Manifold.batch_boolean(ms, 0) if len(ms) > 1 else ms[0]

def rbox_xz(w, h, depth, r, y0, z0):
    """rounded rectangle in the XZ plane (centre x=0), extruded along y from y0 to y0+depth, bottom at z0"""
    pts = []
    for sx, sz in itertools.product((-1, 1), (-1, 1)):
        pts.append(cyl(2 * r, depth, (sx * (w / 2 - r), y0 + depth / 2, z0 + h / 2 + sz * (h / 2 - r)), "y"))
    return Manifold.batch_hull(pts)

def rbox_xy(w, d, hgt, r, z0, yc=0.0):
    pts = [cyl(2 * r, hgt, (sx * (w / 2 - r), yc + sy * (d / 2 - r), z0 + hgt / 2)) for sx in (-1, 1) for sy in (-1, 1)]
    return Manifold.batch_hull(pts)

def tmesh(m):
    mm = m.to_mesh()
    return trimesh.Trimesh(np.asarray(mm.vert_properties)[:, :3], np.asarray(mm.tri_verts), process=True)

# ---- servo in its own frame
def servo_solid(c=0.0, with_horn_space=False):
    parts = [box(SV_L + 2 * c, SV_W + 2 * c, SV_H + 2 * c, (0, 0, SV_H / 2)),
             box(SV_EAR_L + 2 * c, SV_W + 2 * c, SV_EAR_T + 2 * c, (0, 0, SV_EAR_Z + SV_EAR_T / 2)),
             cyl(SV_BOSS_D + 2 * c, SV_BOSS_H + c, (SV_SHAFT_X, 0, SV_H + (SV_BOSS_H + c) / 2 - 0.01))]
    if c > 0:       # wire exit notch at the far end
        parts.append(box(6, 5.5, 10, (-SV_L / 2 - 2, 0, SV_EAR_Z - 4)))
    return union(parts)

def servo_screw_holes(depth=6.0):
    """pilot holes through the ears (cut into the part that holds the servo), pointing toward the servo's back (-z)"""
    return union([cyl(M2_PILOT, depth, (sx * SV_HOLE_SP / 2, 0, SV_EAR_Z - depth / 2 + 0.01)) for sx in (-1, 1)])

def place(m, rot, t):
    return m.rotate(list(rot)).translate(list(t))

# servo orientations (checked numerically at the bottom of the file)
ROT_HIP = (180, 0, 90)      # shaft down, long axis along Y
ROT_ARM = (-90, -90, 0)     # shaft forward (+Y), long axis along Z
ROT_ANK = (-90, 90, 0)      # shaft forward (+Y), long axis along -Z

# ============================================================ torso (Pixel proportions: boxy chest 76 wide x 70 deep x 64 tall)
W_T, D_T, H_T = 76.0, 70.0, 64.0
FLOOR_TOP = TW
HIP_YC = -SV_SHAFT_X                      # hip servo centre y so that the shaft sits at y = 0
HIP_Z0 = FLOOR_TOP + SV_EAR_Z + SV_EAR_T  # world z of the servo's back (local z = 0)
SHELF_Z = HIP_Z0 + 1.2                    # battery shelf height

# --- shoulder pods: the arm servos sit OUTSIDE the chest, shaft pointing forward, so the arms stick out horizontally
POD_WALL = 2.4
POD_T = SV_W + 2 * POD_WALL + 0.7        # lateral thickness of a pod
POD_D = POD_WALL + SV_EAR_Z + SV_EAR_T   # depth (y) of a pod: back wall + body up to the top of the ears
POD_H = SV_EAR_L + 2 * POD_WALL + 0.7    # height (z) of a pod
ARM_XP = W_T / 2 - 1.0 + POD_T / 2       # x of the arm pivot / servo axis
ARM_YB = -POD_D / 2 + POD_WALL           # world y of the servo back
ARM_ZC = 36.5                            # servo centre height; pivot is SV_SHAFT_X above it
ARM_ZP = ARM_ZC + SV_SHAFT_X             # pivot height
POD_FRONT = ARM_YB + SV_EAR_Z + SV_EAR_T

def hip_servo(side, c=0.0):
    return place(servo_solid(c), ROT_HIP, (side * HIP_X, HIP_YC, HIP_Z0))

def arm_servo(side, c=0.0):
    return place(servo_solid(c), ROT_ARM, (side * ARM_XP, ARM_YB, ARM_ZC))

def make_torso():
    outer = rbox_xy(W_T, D_T, H_T, 9, 0)
    cav = box(W_T - 2 * TW, (D_T / 2 - TW) + D_T / 2 + 1, H_T - 2 * TW, (0, ((D_T / 2 - TW) - D_T / 2 - 1) / 2, H_T / 2))
    t = outer - cav
    t = t - box(W_T - 4, TW + 0.01, H_T - 3, (0, -D_T / 2 + TW / 2 - 0.005, H_T / 2))      # rebate for the back cover
    posts = []
    for sx in (-1, 1):
        for z in (7.0, H_T - 7.0):
            posts.append(cyl(6, 9, (sx * (W_T / 2 - TW - 3), -D_T / 2 + TW + 4.5, z), "y"))
    t = union([t] + posts)
    for sx in (-1, 1):
        for z in (7.0, H_T - 7.0):
            t = t - cyl(M2_PILOT, 8, (sx * (W_T / 2 - TW - 3), -D_T / 2 + TW + 4, z), "y")
    # shoulder pods (solid blocks on the sides), pockets open to the front
    for s in (-1, 1):
        pod = box(POD_T, POD_D, POD_H, (s * (W_T / 2 - 1.0 + POD_T / 2), 0, ARM_ZC))
        pod = pod.intersect(rbox_xy(W_T + 2 * POD_T + 6, D_T, H_T, 9, 0)) if False else pod
        t = union([t, pod])
    # hip servo cut-outs + ear screw holes
    for s in (-1, 1):
        t = t - hip_servo(s, CL)
        t = t - place(servo_screw_holes(2.6), ROT_HIP, (s * HIP_X, HIP_YC, HIP_Z0))
    # arm servo pockets (cut through the front of the pod) + ear screw holes + cable hole into the chest
    for s in (-1, 1):
        t = t - arm_servo(s, CL)
        t = t - place(servo_screw_holes(2.8), ROT_ARM, (s * ARM_XP, ARM_YB, ARM_ZC))
        t = t - cyl(6.0, 14.0, (s * (W_T / 2 - 1.5), ARM_YB + 6.0, ARM_ZC - 13.5), "x")
    # battery shelf with two strap slots
    shelf = box(W_T - 2 * TW + 0.2, BATT_W, 2.0, (0, -2.0, SHELF_Z + 1.0))
    shelf = shelf - box(14, 3, 4, (0, -2.0 - 8, SHELF_Z + 1)) - box(14, 3, 4, (0, -2.0 + 8, SHELF_Z + 1))
    t = union([t, shelf])
    # speaker: grill holes in the front wall + a retaining ring
    zc = 40.0
    holes = []
    for r in range(-3, 4):
        for c in range(-3, 4):
            x = c * 4.2 + (2.1 if r % 2 else 0); z = zc + r * 3.6
            if math.hypot(x, z - zc) < 9.8:
                holes.append(cyl(2.3, TW + 2, (x, D_T / 2 - TW / 2, z), "y", 12))
    t = t - union(holes)
    ring = box(SPK_W + 3.2, 3, SPK_L + 3.2, (0, D_T / 2 - TW - 1.5, zc)) - box(SPK_W + 0.6, 4, SPK_L + 0.6, (0, D_T / 2 - TW - 1.5, zc))
    t = union([t, ring])
    # neck: cable slot + head screw clearance holes (the head's neck block screws down here)
    t = t - box(32, 12, TW + 2, (0, 0, H_T - TW / 2))
    for sx in (-1, 1):
        t = t - cyl(M2_CLEAR, TW + 2, (sx * 24, 0, H_T - TW / 2))
    return t

def make_back_cover():
    c = box(W_T - 4 - 0.6, TW - 0.3, H_T - 3 - 0.6, (0, 0, H_T / 2))
    c = c.translate([0, -D_T / 2 + (TW - 0.3) / 2 + 0.05, 0])
    for sx in (-1, 1):
        for z in (7.0, H_T - 7.0):
            c = c - cyl(M2_CLEAR, TW + 2, (sx * (W_T / 2 - TW - 3), -D_T / 2 + TW / 2, z), "y")
    ty = -D_T / 2 + TW - 0.3 + 0.05
    tray = box(PCA_L + 2.4, 3.2, PCA_W + 2.4, (0, ty + 1.6, 40.0)) - box(PCA_L + 0.4, 4, PCA_W + 0.4, (0, ty + 1.6, 40.0))
    tray = tray - box(PCA_L + 4, 4, 12, (0, ty + 1.6, 40.0 - PCA_W / 2 - 0.2))
    c = union([c, tray])
    return c

# ============================================================ head: round Pixel-style head (flattened ball) with a flat front for the square board
HR = 48.0                    # head radius (x and z)
HRY = 41.0                   # head radius in depth (y)
HFRONT = 18.0                # flat front plane (y)
HSPLIT = -8.0                # back cap split plane (y)
HWALL = 3.0
NECK_Z = -HR - 6.0           # bottom of the neck block, head-local z
HEAD_Z0 = H_T + HR + 6.0     # world z of the head centre
HEAD_Y0 = 6.0                # world y of the head centre

def ell(rx, ry, rz, seg=64):
    return Manifold.sphere(1.0, seg).scale([rx, ry, rz])

def make_head():
    outer = ell(HR, HRY, HR) ^ box(2 * HR + 2, HFRONT + HRY + 2, 2 * HR + 2, (0, (HFRONT - HRY) / 2 - 0.0 + 0.0, 0)).translate([0, 0, 0])
    outer = outer ^ box(2 * HR + 2, HFRONT - (-HRY - 1), 2 * HR + 2, (0, (HFRONT + (-HRY - 1)) / 2, 0))
    outer = outer ^ box(2 * HR + 2, 1000, 2 * HR + 2, (0, HSPLIT + 500, 0))                   # keep y >= HSPLIT
    inner = ell(HR - HWALL, HRY - HWALL, HR - HWALL)
    inner = inner ^ box(2 * HR, 1000, 2 * HR, (0, HSPLIT - 1 + 500, 0))
    inner = inner ^ box(2 * HR, 1000, 2 * HR, (0, HFRONT - 2.6 - 500, 0))
    pocket = rbox_xz(BOARD_W + 0.6, BOARD_W + 0.6, 12.0 + 0.6 + 1.0, 3, HFRONT - 2.6 - 12.6 - 0.0, -(BOARD_W + 0.6) / 2)
    h = outer - inner - pocket
    # board stop ledge is the thin front plate; window in the front plate
    h = h - cyl(GLASS_D, 6, (0, HFRONT - 1.3, 0), "y", 96)
    # neck block: screws into the torso
    neck = box(56, 30, 12, (0, -6.0, NECK_Z + 6.0))
    h = union([h, neck])
    for sx in (-1, 1):
        h = h - cyl(M2_PILOT, 8, (sx * 24, -6.0, NECK_Z + 4.0))
    h = h - box(30, 14, 14, (0, -6.0, NECK_Z + 5.0 + 0))      # cable slot (neck is hollow in the middle)
    # screw posts for the back cap
    for k in range(4):
        a = math.radians(45 + 90 * k)
        px, pz = 38.5 * math.cos(a), 38.5 * math.sin(a)
        post = cyl(6.2, 10.0, (px, HSPLIT + 5.0, pz), "y")
        h = union([h, post]) - cyl(M2_PILOT, 8, (px, HSPLIT + 4.0, pz), "y")
    return h

def make_head_lid():
    """back cap: dome that closes the back of the head"""
    outer = ell(HR, HRY, HR) ^ box(2 * HR + 2, 1000, 2 * HR + 2, (0, HSPLIT - 500, 0))
    inner = ell(HR - HWALL, HRY - HWALL, HR - HWALL) ^ box(2 * HR, 1000, 2 * HR, (0, HSPLIT - 500 + 1, 0))
    cap = outer - inner
    ring = cyl(2 * (HR - 4.0), 3.0, (0, HSPLIT - 1.5, 0), "y") - cyl(2 * 34.0, 4.0, (0, HSPLIT - 1.5, 0), "y")
    cap = union([cap, ring])
    for k in range(4):
        a = math.radians(45 + 90 * k)
        px, pz = 38.5 * math.cos(a), 38.5 * math.sin(a)
        cap = cap - cyl(M2_CLEAR, 6, (px, HSPLIT - 1.5, pz), "y")
    # vents (also let the speaker-free air out) + cable relief for USB-C at the bottom
    for k in range(-2, 3):
        cap = cap - box(26, 12, 1.8, (0, HSPLIT - 8, 8 + k * 5.0))
    cap = cap - box(14, 12, 8, (0, HSPLIT - 3, -HR + 8))
    return cap

# ============================================================ arms: horizontal paddles, rotate about the forward axis
ARM_LEN, ARM_W, ARM_T = 34.0, 11.0, 3.0
ARM_Y_BACK = ARM_YB + SV_H + SV_BOSS_H + 0.6      # y of the arm's back face (horn recess side)

def make_arm(side):
    """lies along the outside (side * x) from the pivot, which is the origin; rotated about the Y axis afterwards"""
    y0 = ARM_Y_BACK
    pts = [cyl(ARM_W, ARM_T, (0, y0 + ARM_T / 2, 0), "y"), cyl(ARM_W - 3, ARM_T, (side * ARM_LEN, y0 + ARM_T / 2, 0), "y")]
    a = Manifold.batch_hull(pts)
    rec = 1.6
    a = a - cyl(8.6, rec, (0, y0 + rec / 2 - 0.01, 0), "y") - box(20, rec, 4.8, (side * 5, y0 + rec / 2 - 0.01, 0))
    a = a - cyl(M2_PILOT, ARM_T, (0, y0 + ARM_T / 2, 0), "y")
    return a

# ============================================================ legs
LEG_EXTRA = 22.0                              # extra leg length (Pixel has long legs); 0 = short
LB_W, LB_D = 20.0, 24.5
LB_TOP = -(SV_BOSS_H + 1.3 + 0.6)            # top face of the leg bracket (just under the hip horn space)
LB_H = 40.0 + LEG_EXTRA
LB_ZC = LB_TOP - 20.5 - LEG_EXTRA                        # ankle servo centre height
ANK_Z = LB_ZC - SV_SHAFT_X                   # ankle shaft height (servo long axis points down)
FRONT_IN = LB_D / 2 - TW                     # inner face of the front wall of the bracket

def ankle_servo(c=0.0):
    return place(servo_solid(c), ROT_ANK, (0, FRONT_IN - (SV_EAR_Z + SV_EAR_T), LB_ZC))

def make_leg(side):
    b = box(LB_W, LB_D, LB_H, (0, 0, LB_TOP - LB_H / 2))
    inner = box(LB_W - 2 * 3.4, LB_D, LB_H - 3.2, (0, -TW + 0.0 - 0.0, LB_TOP - 3.2 - (LB_H - 3.2) / 2 - 0.0))
    inner = box(LB_W - 2 * 3.4, LB_D - TW + 1, LB_H - 3.2 + 1, (0, -(TW) / 2 - 0.5 + 0.0, LB_TOP - 3.2 - (LB_H - 3.2 + 1) / 2 + 0.0))
    b = b - inner
    # window for the servo end through the front wall
    b = b - ankle_servo(CL)
    b = b - place(servo_screw_holes(2.8), ROT_ANK, (0, FRONT_IN - (SV_EAR_Z + SV_EAR_T), LB_ZC))
    # hip horn recess in the top plate: round hub + the horn arm along Y
    rec_d = HORN_T + 0.5
    b = b - cyl(9.0, rec_d, (0, 0, LB_TOP - rec_d / 2 + 0.01)) - box(4.8, 22, rec_d, (0, 0, LB_TOP - rec_d / 2 + 0.01))
    b = b - cyl(M2_PILOT, 6, (0, 0, LB_TOP - 5))              # centre screw of the horn
    return b

# ============================================================ foot
SOLE_W, SOLE_L, SOLE_T = 26.0, 44.0, 3.5
SOLE_Z = ANK_Z - 24.0                         # sole bottom
TAB_Y0 = FRONT_IN + 2 * 0 + (TW + 0.0)        # placeholder, recomputed below
HORN_FRONT_Y = (FRONT_IN - (SV_EAR_Z + SV_EAR_T)) + SV_H + SV_BOSS_H     # y where the boss ends (horn starts)

def make_foot():
    ty0 = HORN_FRONT_Y + 0.6                  # tab back face (horn sits in the recess)
    tab_t = 3.6
    top = ANK_Z + 11.0
    sole_y0 = ty0 + tab_t - SOLE_L
    sole = box(SOLE_W, SOLE_L, SOLE_T, (0, sole_y0 + SOLE_L / 2, SOLE_Z + SOLE_T / 2))
    tab = box(16.0, tab_t, top - SOLE_Z, (0, ty0 + tab_t / 2, SOLE_Z + (top - SOLE_Z) / 2))
    # fillet-ish gusset
    g = Manifold.batch_hull([box(16, 0.1, 0.1, (0, ty0 + 0.05, SOLE_Z + SOLE_T)),
                             box(16, 0.1, 0.1, (0, ty0 - 9, SOLE_Z + SOLE_T)),
                             box(16, 0.1, 0.1, (0, ty0 + 0.05, SOLE_Z + SOLE_T + 14))])
    f = union([sole, tab, g])
    rec = 1.6
    f = f - cyl(9.0, rec, (0, ty0 + rec / 2 - 0.01, ANK_Z), "y") - box(4.8, rec, 22, (0, ty0 + rec / 2 - 0.01, ANK_Z))
    f = f - cyl(M2_PILOT, 5, (0, ty0 + tab_t / 2, ANK_Z), "y")
    # soft-grip pattern: shallow grooves under the sole
    for k in range(-3, 4):
        f = f - box(SOLE_W + 1, 1.2, 0.8, (0, sole_y0 + SOLE_L / 2 + k * 5.0, SOLE_Z + 0.35))
    return f

# ============================================================ fit test coupon (print this first, 10 minutes)
def make_fit_test():
    blk = box(48, 24, 8, (0, 0, 4))
    # servo window + ears
    blk = blk - box(SV_L + 2 * CL, SV_W + 2 * CL, 20, (-9, 0, 4))
    blk = blk - box(SV_EAR_L + 2 * CL, SV_W + 2 * CL, SV_EAR_T + 2 * CL, (-9, 0, 8 - SV_EAR_T / 2 - CL))
    # ear screw pilot holes
    for sx in (-1, 1):
        blk = blk - cyl(M2_PILOT, 5, (-9 + sx * SV_HOLE_SP / 2, 0, 2.5))
    # test of the board pocket corner (a 20 mm piece of the pocket)
    tab = box(26, 26, 5, (0, 30, 2.5)) - box(20, 20, 6, (-0.5 + 3, 30 + 3, 3.5))
    # horn recess test
    pl = box(26, 20, 6, (0, -26, 3)) - cyl(9.0, HORN_T + 0.5, (0, -26, 6 - (HORN_T + 0.5) / 2 + 0.01)) - box(4.8, 22, HORN_T + 0.5, (0, -26, 6 - (HORN_T + 0.5) / 2 + 0.01))
    return union([blk, tab, pl])

# ============================================================ build, assemble, check
def build_all():
    parts = {}
    parts["01_head"] = make_head()
    parts["02_head_back_cap"] = make_head_lid()
    parts["03_torso"] = make_torso()
    parts["04_torso_back_cover"] = make_back_cover()
    parts["05_leg_L"] = make_leg(-1)
    parts["06_leg_R"] = make_leg(+1)
    parts["07_foot_L"] = make_foot()
    parts["08_foot_R"] = make_foot().mirror([1, 0, 0])
    parts["09_arm_L"] = make_arm(-1)
    parts["10_arm_R"] = make_arm(+1)
    return parts

def assembly(parts, hip=(0, 0), ank=(0, 0), arm=(0, 0)):
    """world positions of the printed parts. hip/ank/arm angles in degrees for (L, R).
    hip: yaw about the hip axis, ank: roll about the ankle axis, arm: raise angle (0 = horizontal, +up, -down)"""
    A = {}
    A["head"] = parts["01_head"].translate([0, HEAD_Y0, HEAD_Z0])
    A["cap"] = parts["02_head_back_cap"].translate([0, HEAD_Y0, HEAD_Z0])
    A["torso"] = parts["03_torso"]
    A["cover"] = parts["04_torso_back_cover"]
    for k, s, name in ((0, -1, "L"), (1, 1, "R")):
        leg = parts["05_leg_L"] if s < 0 else parts["06_leg_R"]
        foot = parts["07_foot_L"] if s < 0 else parts["08_foot_R"]
        foot = foot.translate([0, 0, -ANK_Z]).rotate([0, ank[k], 0]).translate([0, 0, ANK_Z])
        A["leg" + name] = leg.rotate([0, 0, hip[k]]).translate([s * HIP_X, 0, 0])
        A["foot" + name] = foot.rotate([0, 0, hip[k]]).translate([s * HIP_X, 0, 0])
        a = parts["09_arm_L"] if s < 0 else parts["10_arm_R"]
        A["arm" + name] = a.rotate([0, -s * arm[k], 0]).translate([s * ARM_XP, 0, ARM_ZP])
    return A

def ghosts():
    """non-printed parts used only for clash checks and the preview"""
    G = {}
    for s in (-1, 1):
        G["hipservo%+d" % s] = hip_servo(s)
        G["armservo%+d" % s] = arm_servo(s)
        G["ankleservo%+d" % s] = ankle_servo().translate([s * HIP_X, 0, 0])
    G["board"] = box(BOARD_W, 12.0, BOARD_W, (0, HEAD_Y0 + HFRONT - 2.6 - 6.0 - 0.3, HEAD_Z0))
    G["battery"] = box(BATT_L, BATT_W, BATT_T, (0, -2.0, SHELF_Z + 2.0 + BATT_T / 2))
    G["speaker"] = box(SPK_W, SPK_T, SPK_L, (0, D_T / 2 - TW - 3 + SPK_T / 2 - 1.5, 40.0))
    ty = -D_T / 2 + TW - 0.3 + 0.05
    G["pca"] = box(PCA_L, 1.6, PCA_W, (0, ty + 1.6 + 0.2, 40.0))
    return G

# ============================================================ clash checks / export / previews
def overlap(a, b):
    return (a ^ b).volume()

def clash_report(P, verbose=True):
    G = ghosts()
    allowed = {("head", "torso"), ("head", "cap"), ("torso", "cover"), ("cap", "torso")}
    worst = []
    def check(tag, A, gh):
        printed = {k: v for k, v in A.items()}
        # printed vs printed
        for (a, ma), (b, mb) in itertools.combinations(printed.items(), 2):
            if (a, b) in allowed or (b, a) in allowed: continue
            v = overlap(ma, mb)
            if v > 0.5: worst.append((tag, a, b, round(v, 1)))
        # ghosts vs printed (servos legitimately sit in their pockets -> only flag the ones that should be free)
        for gname, gm in gh.items():
            for pname, pm in printed.items():
                if gname.startswith("hipservo") and pname in ("torso", "legL", "legR", "cover"): continue
                if gname.startswith("armservo") and pname in ("torso", "cover"): continue
                if gname.startswith("ankleservo") and pname.startswith("leg"): continue
                if gname in ("board",) and pname in ("head", "cap"): continue
                if gname in ("battery", "speaker", "pca") and pname in ("torso", "cover"): continue
                v = overlap(gm, pm)
                if v > 0.5: worst.append((tag, gname, pname, round(v, 1)))
    gh0 = ghosts()
    check("neutral", assembly(P), gh0)
    for h in (-20, 20):
        check(f"hip {h}", assembly(P, hip=(h, -h)), gh0)
        check(f"hip same {h}", assembly(P, hip=(h, h)), gh0)
    for a in (-20, 20):
        check(f"ankle {a}", assembly(P, ank=(a, a)), gh0)
    for a in (-12, 12):
        check(f"ankle opp {a}", assembly(P, ank=(a, -a)), gh0)
    for r in (-60, -30, 0, 45, 90, 95):
        check(f"arms {r}", assembly(P, arm=(r, r)), gh0)
    check("walk-ish", assembly(P, hip=(18, -18), ank=(15, -15), arm=(40, 10)), gh0)
    if verbose:
        if worst:
            for w in sorted(set(worst)): print("CLASH", w)
        else:
            print("no clashes in any tested pose")
    return worst

def export_all(P):
    os.makedirs(os.path.join(OUT, "stl"), exist_ok=True)
    P2 = dict(P); P2["00_fit_test"] = make_fit_test()
    for k, m in sorted(P2.items()):
        tm = tmesh(m)
        # print orientation: bottom on the bed
        tm.apply_translation([0, 0, -tm.bounds[0][2]])
        tm.export(os.path.join(OUT, "stl", k + ".stl"))
        print(f"{k:22s} watertight={tm.is_watertight!s:5} vol={tm.volume/1000:6.1f} cm3  size={np.round(tm.extents,1)}")

def previews(P):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from mpl_toolkits.mplot3d.art3d import Poly3DCollection
    os.makedirs(os.path.join(OUT, "previews"), exist_ok=True)
    A = assembly(P, arm=(0, 0))
    colors = {"head": "#4aa3ff", "cap": "#2d7bd1", "torso": "#f2f2f2", "cover": "#cccccc", "legL": "#ffb347", "legR": "#ffb347",
              "footL": "#ff8c1a", "footR": "#ff8c1a", "armL": "#8ee08e", "armR": "#8ee08e"}
    def draw(ax, elev, azim, A):
        for k, m in A.items():
            tm = tmesh(m)
            pc = Poly3DCollection(tm.vertices[tm.faces], facecolor=colors[k], edgecolor="none", alpha=1.0)
            # simple shading from face normals
            n = tm.face_normals; light = np.array([0.4, -0.6, 0.7]); light /= np.linalg.norm(light)
            sh = 0.45 + 0.55 * np.clip(n @ light, 0, 1)
            base = np.array(matplotlib.colors.to_rgb(colors[k]))
            pc.set_facecolor(np.outer(sh, base).clip(0, 1))
            ax.add_collection3d(pc)
        ax.set_xlim(-100, 100); ax.set_ylim(-100, 100); ax.set_zlim(-70, 190)
        ax.set_box_aspect((200, 200, 260)); ax.view_init(elev, azim); ax.set_axis_off()
    fig = plt.figure(figsize=(14, 7))
    for i, (e, a, t) in enumerate(((6, 90, "front"), (6, 0, "side"), (18, 125, "3/4 view"))):
        ax = fig.add_subplot(1, 3, i + 1, projection="3d"); draw(ax, e, a, A); ax.set_title(t)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, "previews", "assembled.png"), dpi=110); plt.close(fig)
    # exploded print layout
    fig = plt.figure(figsize=(14, 7)); ax = fig.add_subplot(111, projection="3d")
    x = 0; E = {}
    for k, m in sorted(P.items()):
        tm = tmesh(m); b = tm.bounds
        tm.apply_translation([x - b[0][0], -(b[0][1] + b[1][1]) / 2, -b[0][2]]); x += tm.extents[0] + 8
        pc = Poly3DCollection(tm.vertices[tm.faces], edgecolor="none")
        n = tm.face_normals; light = np.array([0.4, -0.6, 0.7]); light /= np.linalg.norm(light)
        pc.set_facecolor(np.outer(0.45 + 0.55 * np.clip(n @ light, 0, 1), [0.5, 0.7, 1.0]).clip(0, 1)); ax.add_collection3d(pc)
    ax.set_xlim(0, x); ax.set_ylim(-45, 45); ax.set_zlim(0, 80); ax.set_box_aspect((x, 90, 80)); ax.view_init(35, -70); ax.set_axis_off()
    fig.savefig(os.path.join(OUT, "previews", "parts.png"), dpi=110); plt.close(fig)

if __name__ == "__main__":
    P = build_all()
    for name, rot in (("hip", ROT_HIP), ("arm", ROT_ARM), ("ankle", ROT_ANK)):
        probe = Manifold.cube([0.2, 0.2, 0.2], True).translate([5.5, 0, 25.0])
        bb = probe.rotate(list(rot)).bounding_box()
        print(name, "shaft-side point ->", np.round([(bb[0]+bb[3])/2, (bb[1]+bb[4])/2, (bb[2]+bb[5])/2], 1))
    w = clash_report(P)
    export_all(P)
    previews(P)
