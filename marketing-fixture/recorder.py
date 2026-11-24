"""Deterministic synthetic dashboard reel. Python standard library only."""
import hashlib
import json
from pathlib import Path
import struct
import sys
import zlib

W, H = 480, 270
L, R = (44,110,211,171), (263,110,429,171)
FONT = dict(zip("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789/-.: ", """
0E111F1111 1E111E111E 0F1010100F 1E1111111E 1F101E101F
1F101E1010 0F1013110F 11111F1111 1F0404041F 070202120C
11121C1211 101010101F 111B151111 1119151311 0E1111110E
1E111E1010 0E1111150B 1E111E1211 0F100E011E 1F04040404
111111110E 1111110A04 1111151B11 110A040A11 110A040404
1F0204081F 0E1315190E 040C04040E 0E1106081F 1E0106011E
12121F0202 1F101E011E 0E101E110E 1F01020408 0E110E110E
0E110F010E 0102040810 00001F0000 0000000004 0004000400 0000000000
""".split()))
PALETTE = bytes.fromhex("10151F 151E2D 1D2B3D 2A4155 0B121C 070C12 E8F7FA 94AAB7 5EEAD4 2A786E A7C4FF 4E6FAD FFCB8B 704A33 223B50 3B6076")
SIG = b"\x89PNG\r\n\x1a\n"


class Frame:
    def __init__(self):
        self.pixels = bytearray(W * H)

    def rect(self, x0, y0, x1, y1, color):
        line = bytes((color,)) * (x1 - x0)
        for y in range(y0, y1):
            self.pixels[y * W + x0:y * W + x1] = line

    def line(self, points, color):
        for (x0, y0), (x1, y1) in zip(points, points[1:]):
            span = max(abs(x1 - x0), abs(y1 - y0), 1)
            for n in range(span + 1):
                x, y = x0 + (x1-x0)*n//span, y0 + (y1-y0)*n//span
                self.rect(x, y, x+2, y+2, color)

    def label(self, x, y, value, color=6, scale=1):
        for letter in value:
            for row, bits in enumerate(bytes.fromhex(FONT[letter])):
                for col in range(5):
                    if bits & (16 >> col):
                        self.rect(x+col*scale, y+row*scale, x+(col+1)*scale, y+(row+1)*scale, color)
            x += 6 * scale

    def circle(self, cx, cy, radius, color):
        for y in range(-radius, radius+1):
            for x in range(-radius, radius+1):
                if x*x+y*y <= radius*radius:
                    self.rect(cx+x, cy+y, cx+x+1, cy+y+1, color)

    def sample(self, rect):
        x0, y0, x1, y1 = rect
        return b"".join(self.pixels[y*W+x0:y*W+x1] for y in range(y0,y1))

    def compressed(self):
        return zlib.compress(b"".join(b"\0"+self.pixels[y*W:(y+1)*W] for y in range(H)), 9)


def studio(s, n):
    f = Frame()
    cut = n >= s["transition_frame"]
    f.rect(0,54,W,217,1)
    f.rect(0,210,W,228,2)
    for x in range(8,W,16):
        for y in range(60,214,12):
            f.rect(x,y,x+1,y+1,3)
    f.rect(18,13,22,41,8)
    f.label(32,15,s["title"],6,2)
    f.label(32,35,"TWO INDEPENDENT VIDEO ROUTES",7)
    f.rect(353,15,463,32,1)
    f.label(358,21,s["badge"],12)
    for x, title, tint in ((34,"A / SHIPPING",12 if cut else 8),(251,"B / HEALTH",10)):
        f.rect(x-5,73,x+200,200,4)
        f.rect(x,78,x+195,194,5)
        f.rect(x+7,86,x+9,95,tint)
        f.label(x+15,88,title,tint)
        f.rect(x+7,100,x+188,101,3)
        f.rect(x+87,200,x+108,206,4)
        f.rect(x+68,206,x+127,209,4)
    if cut:
        f.rect(44,112,219,176,1)
        f.rect(44,112,219,115,12)
        f.label(54,132,"SOURCE A CLOSED",12,2)
        f.label(54,152,"ONLY THIS SCREEN IS SLATED",7)
    else:
        f.label(46,110,"RELEASE QUEUE",7)
        f.label(46,120,f"BUILDS {20+n:03}",8,2)
        for slot in range(10):
            height = 5+(n*(slot%4+3)+4*slot**2)%33
            x = 47+slot*16
            f.rect(x,169-height,x+10,169,8 if slot%3==0 else 9)
        f.label(46,184,"A ACTIVE",8)
    f.label(262,110,"HEARTBEAT",7)
    f.label(262,120,f"SEQ {100+n:03}",10,2)
    for y in (146,156,166,176):
        f.rect(265,y,430,y+1,3)
    f.line([(266+k*11,146+((k*k*11+n*(k%5+3))%25)) for k in range(15)],10)
    f.label(262,184,"B ACTIVE",10)
    # Geometric synthetic foreground, not a recording of a person.
    center = 240 + (min(n,s["frames"]-1-n)//3-3)*2
    f.circle(center,185,12,6)
    f.circle(center,186,11,14)
    for y in range(195,228):
        half = min(30,12+(y-195)//2)
        f.rect(center-half,y,center+half,y+1,14)
    f.line([(center-8,195),(center,215),(center+8,195)],15)
    f.rect(17,233,463,234,3)
    f.rect(17,233,17+446*(n+1)//s["frames"],234,8)
    f.label(18,243,"02" if cut else "01",12 if cut else 8,2)
    f.label(49,244,s["after"] if cut else s["before"],6,2)
    return f


def chunk(tag, data):
    return struct.pack(">I",len(data))+tag+data+struct.pack(">I",zlib.crc32(tag+data))


def png(frames, fps=None):
    out = [SIG,chunk(b"IHDR",struct.pack(">IIBBBBB",W,H,8,3,0,0,0))]
    if fps:
        out.append(chunk(b"acTL",struct.pack(">II",len(frames),0)))
    out.append(chunk(b"PLTE",PALETTE))
    seq = 0
    for n, frame in enumerate(frames):
        if fps:
            out.append(chunk(b"fcTL",struct.pack(">IIIIIHHBB",seq,W,H,0,0,1,fps,0,0)))
            seq += 1
        data = frame.compressed()
        if n:
            out.append(chunk(b"fdAT",struct.pack(">I",seq)+data))
            seq += 1
        else:
            out.append(chunk(b"IDAT",data))
    return b"".join(out+[chunk(b"IEND",b"")])


def render(storyboard, destination):
    s = json.loads(Path(storyboard).read_text(encoding="utf-8"))
    count,fps,cut = (s[k] for k in ("frames","fps","transition_frame"))
    if not (all(type(x) is int for x in (count,fps,cut)) and 8<=count<=64 and 4<=fps<=12 and 3<=cut<=count-3):
        raise ValueError("Invalid bounded fixture timeline")
    for key, limit in {"title":25,"badge":17,"before":34,"after":34}.items():
        value=s[key]
        if not (type(value) is str and 0<len(value)<=limit and all(c in FONT for c in value)):
            raise ValueError(f"Invalid fixture label: {key}")
    if s["badge"]!="SIMULATED FIXTURE":
        raise ValueError("Badge must identify the rendered simulation")
    frames=[studio(s,n) for n in range(count)]
    if not (len({f.sample(L) for f in frames[:cut]})==cut and
            len({f.sample(L) for f in frames[cut:]})==1 and
            len({f.sample(R) for f in frames})==count and
            frames[cut-1].sample(L)!=frames[cut].sample(L)):
        raise RuntimeError("Left-only slate or independent right motion not verified")
    payload={
        "fixture-reel.png":png(frames,fps),
        "both-live.png":png([frames[0]]),
        "left-slate.png":png([frames[cut]]),
    }
    if sum(map(len,payload.values()))>500000:
        raise RuntimeError("Media budget exceeded")
    dest=Path(destination)
    dest.mkdir(parents=True,exist_ok=True)
    for name,data in payload.items():
        (dest/name).write_bytes(data)
    receipt={
        "kind":"rendered-simulation","audio":False,"width":W,"height":H,
        "frame_count":count,"fps":fps,"transition_frame":cut,
        "left_sample":L,"right_sample":R,
        "phases":[{"name":"both-live","start_frame":0,"end_frame":cut-1},
                  {"name":"left-slate","start_frame":cut,"end_frame":count-1}],
        "files":{name:{"bytes":len(data),"sha256":hashlib.sha256(data).hexdigest()}
                 for name,data in payload.items()},
    }
    (dest/"run.json").write_text(json.dumps(receipt,indent=2)+"\n",encoding="utf-8")


if __name__=="__main__":
    if len(sys.argv)!=3:
        raise SystemExit("Usage: python3 recorder.py <storyboard.json> <outdir>")
    render(*sys.argv[1:])
