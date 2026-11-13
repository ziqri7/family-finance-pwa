from PIL import Image, ImageDraw
from pathlib import Path
Path('public/icons').mkdir(parents=True,exist_ok=True)
for size in (192,512):
    scale=size/192
    image=Image.new('RGB',(size,size),'#7042b3')
    draw=ImageDraw.Draw(image)
    def line(points): draw.line([(int(x*scale),int(y*scale)) for x,y in points],fill='white',width=round(9*scale),joint='curve')
    line([(48,66),(48,55),(130,55),(130,71)])
    line([(47,71),(147,71),(147,143),(47,143),(47,71)])
    line([(147,92),(118,92),(118,122),(147,122)])
    draw.ellipse(tuple(round(v*scale) for v in (126,103,134,111)),fill='white')
    image.save(f'public/icons/icon-{size}.png')
