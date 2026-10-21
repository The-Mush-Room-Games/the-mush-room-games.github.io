#!/usr/bin/env python3
"""Rebuild assets/interiors/house_a_1.png and house_a_2.png from the Modern Interiors Generic_Home_1 design, then grade the colours.

Run from anywhere:  python3 tools/make_house_a.py        (needs PIL, numpy; the pack in WebGames/Assets)
Layer 1 = room shell (a few walls patched so the room is closed), layer 2 = furniture (the pack's stray character and
unwanted pieces cleared).
"""
import sys
from pathlib import Path
from PIL import Image
sys.path.insert(0, str(Path(__file__).resolve().parent))
from interior_color import grade

GAME = Path(__file__).resolve().parent.parent
D = GAME.parents[2] / "WebGames/Assets/moderninteriors-win/6_Home_Designs/Generic_Home_Designs/48x48/"
O = GAME / "assets/interiors/"
l1=Image.open(D/'Generic_Home_1_Layer_1_48x48.png').convert('RGBA')
l2=Image.open(D/'Generic_Home_1_Layer_2_48x48.png').convert('RGBA')
def patch(im,dst_box,src_xy):          # copy a block
    w=dst_box[2]-dst_box[0]; h=dst_box[3]-dst_box[1]
    im.paste(im.crop((src_xy[0],src_xy[1],src_xy[0]+w,src_xy[1]+h)),(dst_box[0],dst_box[1]))
# top opening: wall face copied from beside it
patch(l1,(332,0,392,96),(240,0))
# left corridor mouth x 96..144: straight wall (rows 336..383) tiled over y 96..335
tile=l1.crop((96,336,144,384))
for y in range(96,336,48): l1.paste(tile,(96,y))
# right corridor mouth x 576..624: rows 336..383 tiled over y 144..335
tile=l1.crop((576,336,624,384))
for y in range(144,336,48): l1.paste(tile,(576,y))
box=(96,0,624,642)
l1=l1.crop(box); l2=l2.crop(box)
def clear(x0,y0,x1,y1,keep=lambda x,y:False):
    px=l2.load()
    for y in range(y0,y1):
        for x in range(x0,x1):
            if not keep(x,y): px[x,y]=(0,0,0,0)
clear(336,121,383,172,lambda x,y: x>=366 and y<=130)   # the straw-hat character drawn into the design
clear(0,120,48,270)         # corridor plant, left
clear(480,170,528,275)      # corridor plant, right
clear(300,190,365,225)      # grey floor cushion
clear(48,244,100,321)       # grey machine behind the bed
px=l2.load()                # stray red/orange pixels of the character that touch the bed
for y in range(119,135):
    for x in range(336,375):
        r,g,b,a=px[x,y]
        if a and r>150 and g<110: px[x,y]=(0,0,0,0)
grade(l1).save(O/'house_a_1.png'); grade(l2).save(O/'house_a_2.png')
