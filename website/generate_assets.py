"""
VLVT Website Asset Generator
Generates gold-themed app mockup and icons for the premium VIP aesthetic
"""

import os
from PIL import Image, ImageDraw, ImageFilter

# Ensure directory exists
os.makedirs("assets/generated", exist_ok=True)

# Color palette
GOLD = "#D4AF37"
GOLD_LIGHT = "#F2D26D"
CRIMSON = "#C41E3A"
DARK_BG = "#0D0D0D"
SURFACE = "#1A1A1A"
SURFACE_ELEVATED = "#242424"

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def create_gradient_vertical(width, height, color1, color2):
    """Create a vertical gradient image"""
    base = Image.new('RGB', (width, height), hex_to_rgb(color1))
    top = Image.new('RGB', (width, height), hex_to_rgb(color2))
    mask = Image.new('L', (width, height))
    mask_data = []
    for y in range(height):
        mask_data.extend([int(255 * (y / height))] * width)
    mask.putdata(mask_data)
    base.paste(top, (0, 0), mask)
    return base


# --- 1. Generate App Mockup (Hero Image) ---
def generate_app_mockup():
    w, h = 400, 800
    img = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Phone Frame (Dark with Gold Border)
    draw.rounded_rectangle([(10, 10), (390, 790)], radius=45, fill=hex_to_rgb("#080808"), outline=hex_to_rgb(GOLD), width=3)

    # Inner screen bezel
    draw.rounded_rectangle([(18, 18), (382, 782)], radius=40, fill=hex_to_rgb(DARK_BG))

    # Status bar area
    draw.text((175, 35), "9:41", fill=hex_to_rgb("#FFFFFF"))

    # Notch/Dynamic Island
    draw.rounded_rectangle([(160, 25), (240, 50)], radius=12, fill=hex_to_rgb("#000000"))

    # Profile Card Background
    card_top = 80
    card_bottom = 580
    draw.rounded_rectangle([(30, card_top), (370, card_bottom)], radius=24, fill=hex_to_rgb(SURFACE))

    # Profile Image Placeholder (gradient circle)
    profile_size = 280
    profile_x = (w - profile_size) // 2
    profile_y = card_top + 20

    # Create gradient for profile placeholder
    profile_grad = create_gradient_vertical(profile_size, profile_size, "#333333", "#1a1a1a")

    # Create circular mask
    mask = Image.new('L', (profile_size, profile_size), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.ellipse((0, 0, profile_size-1, profile_size-1), fill=255)

    # Apply mask
    profile_rgba = profile_grad.convert('RGBA')
    profile_rgba.putalpha(mask)
    img.paste(profile_rgba, (profile_x, profile_y), profile_rgba)

    # Gold ring around profile
    draw.ellipse((profile_x-2, profile_y-2, profile_x+profile_size+2, profile_y+profile_size+2),
                 outline=hex_to_rgb(GOLD), width=2)

    # Name and info
    draw.text((50, card_bottom - 110), "Sophia, 26", fill=hex_to_rgb("#FFFFFF"))
    draw.text((50, card_bottom - 80), "Creative Director", fill=hex_to_rgb("#888888"))
    draw.text((50, card_bottom - 55), "2 miles away", fill=hex_to_rgb("#666666"))

    # Action buttons at bottom
    btn_y = 620
    btn_size = 70

    # Pass button (X) - Crimson outline
    x_center = 100
    draw.ellipse((x_center - btn_size//2, btn_y, x_center + btn_size//2, btn_y + btn_size),
                 outline=hex_to_rgb(CRIMSON), width=3)
    # X mark
    offset = 18
    draw.line((x_center - offset, btn_y + btn_size//2 - offset,
               x_center + offset, btn_y + btn_size//2 + offset), fill=hex_to_rgb(CRIMSON), width=3)
    draw.line((x_center - offset, btn_y + btn_size//2 + offset,
               x_center + offset, btn_y + btn_size//2 - offset), fill=hex_to_rgb(CRIMSON), width=3)

    # Like button (Heart) - Gold filled
    heart_center = 300
    draw.ellipse((heart_center - btn_size//2, btn_y, heart_center + btn_size//2, btn_y + btn_size),
                 fill=hex_to_rgb(GOLD))
    # Simple heart shape
    draw.polygon([
        (heart_center, btn_y + 55),  # Bottom point
        (heart_center - 20, btn_y + 30),  # Left
        (heart_center - 20, btn_y + 20),  # Left top
        (heart_center, btn_y + 28),  # Center dip
        (heart_center + 20, btn_y + 20),  # Right top
        (heart_center + 20, btn_y + 30),  # Right
    ], fill=hex_to_rgb(DARK_BG))

    # Bottom nav bar
    nav_y = 720
    draw.rounded_rectangle([(30, nav_y), (370, 770)], radius=20, fill=hex_to_rgb(SURFACE_ELEVATED))

    # Nav icons (simple circles)
    nav_icons_x = [80, 150, 250, 320]
    for i, x in enumerate(nav_icons_x):
        color = GOLD if i == 0 else "#666666"
        draw.ellipse((x-12, nav_y+13, x+12, nav_y+37), fill=hex_to_rgb(color))

    # Add subtle glow effect
    img_with_glow = Image.new('RGBA', (w + 40, h + 40), (0, 0, 0, 0))

    # Create glow
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow)
    glow_draw.rounded_rectangle([(10, 10), (390, 790)], radius=45, fill=(212, 175, 55, 60))
    glow = glow.filter(ImageFilter.GaussianBlur(radius=15))

    img_with_glow.paste(glow, (20, 20), glow)
    img_with_glow.paste(img, (20, 20), img)

    img_with_glow.save("assets/generated/app_mockup.png")
    print("Generated: app_mockup.png")


# --- 2. Generate Feature Icons ---
def generate_icon(name, draw_func):
    size = 128
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    draw_func(draw, size)

    img.save(f"assets/generated/icon_{name}.png")
    print(f"Generated: icon_{name}.png")


def draw_price_icon(draw, size):
    """One Price - Credit card with checkmark"""
    gold = hex_to_rgb(GOLD)
    # Card shape
    draw.rounded_rectangle([(15, 35), (113, 93)], radius=8, outline=gold, width=4)
    # Stripe
    draw.rectangle([(15, 50), (113, 62)], fill=gold)
    # Checkmark
    draw.line([(75, 75), (88, 88), (110, 55)], fill=gold, width=4)


def draw_nopay_icon(draw, size):
    """No Pay-to-Win - Crossed out coins"""
    gold = hex_to_rgb(GOLD)
    # Circle (coin)
    draw.ellipse([(25, 25), (103, 103)], outline=gold, width=4)
    # Dollar sign
    draw.line([(64, 40), (64, 88)], fill=gold, width=3)
    draw.arc([(48, 40), (80, 65)], 0, 180, fill=gold, width=3)
    draw.arc([(48, 63), (80, 88)], 180, 0, fill=gold, width=3)
    # Cross out
    draw.line([(30, 30), (98, 98)], fill=hex_to_rgb(CRIMSON), width=5)


def draw_human_icon(draw, size):
    """Real Humans - Person with checkmark"""
    gold = hex_to_rgb(GOLD)
    # Head
    draw.ellipse([(44, 15), (84, 55)], outline=gold, width=4)
    # Body
    draw.arc([(30, 55), (98, 115)], 180, 0, fill=gold, width=4)
    # Checkmark badge
    draw.ellipse([(80, 70), (115, 105)], fill=gold)
    draw.line([(88, 88), (95, 95), (108, 78)], fill=hex_to_rgb(DARK_BG), width=3)


def draw_lock_icon(draw, size):
    """Privacy Lock"""
    gold = hex_to_rgb(GOLD)
    # Lock body
    draw.rounded_rectangle([(35, 55), (93, 105)], radius=8, outline=gold, width=4)
    # Lock shackle
    draw.arc([(42, 25), (86, 70)], 180, 0, fill=gold, width=4)
    # Keyhole
    draw.ellipse([(58, 70), (70, 82)], fill=gold)
    draw.rectangle([(61, 78), (67, 92)], fill=gold)


def draw_bouncer_icon(draw, size):
    """Paywall Bouncer - Velvet rope"""
    gold = hex_to_rgb(GOLD)
    crimson = hex_to_rgb(CRIMSON)
    # Left post
    draw.rectangle([(25, 30), (35, 100)], fill=gold)
    draw.ellipse([(22, 22), (38, 38)], fill=gold)
    # Right post
    draw.rectangle([(93, 30), (103, 100)], fill=gold)
    draw.ellipse([(90, 22), (106, 38)], fill=gold)
    # Rope (curved line)
    draw.arc([(25, 45), (103, 85)], 0, 180, fill=crimson, width=6)


# Generate all assets
if __name__ == "__main__":
    print("Generating VLVT website assets...")
    print("-" * 40)

    try:
        generate_app_mockup()

        icons = [
            ("price", draw_price_icon),
            ("nopay", draw_nopay_icon),
            ("human", draw_human_icon),
            ("lock", draw_lock_icon),
            ("bouncer", draw_bouncer_icon),
        ]

        for name, draw_func in icons:
            generate_icon(name, draw_func)

        print("-" * 40)
        print("All assets generated successfully!")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()
