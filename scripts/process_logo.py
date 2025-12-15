from PIL import Image


def process_logo():
    input_path = 'themes/loe_original/static/img/logo_rect_v3.jpg'
    output_path = 'themes/loe_original/static/img/logo_rect_v3.png'

    try:
        img = Image.open(input_path)
        img = img.convert("RGBA")
        
        datas = img.getdata()
        
        newData = []
        # Basic transparency assuming white background
        for item in datas:
            if item[0] > 240 and item[1] > 240 and item[2] > 240:
                newData.append((255, 255, 255, 0))
            else:
                newData.append(item)
        
        img.putdata(newData)
        
        # Crop
        img = img.crop(img.getbbox())
        
        img.save(output_path, "PNG")
        print(f"Successfully processed image to {output_path}")
        
    except Exception as e:
        print(f"Error processing image: {e}")

if __name__ == "__main__":
    process_logo()
