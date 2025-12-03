"""
VLVT Website Asset Generator
Generates realistic app mockup matching the actual Flutter app design
"""

import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

# Ensure directory exists
os.makedirs("assets/generated", exist_ok=True)

# Color palette - matching vlvt_colors.dart exactly
BACKGROUND = "#0D0D0D"
SURFACE = "#1A1A1A"
SURFACE_ELEVATED = "#242424"
PRIMARY = "#6B3FA0"
PRIMARY_LIGHT = "#8B5FC0"
GOLD = "#D4AF37"
GOLD_LIGHT = "#F2D26D"
CRIMSON = "#C41E3A"
SUCCESS = "#2ECC71"
TEXT_PRIMARY = "#F2F2F2"
TEXT_SECONDARY = "#B3B3B3"
TEXT_MUTED = "#808080"

def hex_to_rgb(hex_color):
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

def hex_to_rgba(hex_color, alpha=255):
    rgb = hex_to_rgb(hex_color)
    return (*rgb, alpha)

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

def create_diagonal_gradient(width, height, color1, color2):
    """Create a diagonal gradient from top-left to bottom-right"""
    img = Image.new('RGB', (width, height), hex_to_rgb(color1))
    c1 = hex_to_rgb(color1)
    c2 = hex_to_rgb(color2)

    pixels = img.load()
    for y in range(height):
        for x in range(width):
            # Calculate blend factor based on position
            blend = ((x / width) + (y / height)) / 2
            r = int(c1[0] + (c2[0] - c1[0]) * blend)
            g = int(c1[1] + (c2[1] - c1[1]) * blend)
            b = int(c1[2] + (c2[2] - c1[2]) * blend)
            pixels[x, y] = (r, g, b)

    return img


def generate_app_mockup():
    """Generate a realistic app mockup matching the Flutter app design"""

    # Phone dimensions (similar to iPhone proportions)
    phone_w, phone_h = 380, 780
    screen_margin = 12
    corner_radius = 40

    # Create base image with transparency
    img = Image.new('RGBA', (phone_w + 60, phone_h + 60), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Offset for centering (leave room for glow)
    ox, oy = 30, 30

    # Phone outer frame (dark with gold border)
    draw.rounded_rectangle(
        [(ox, oy), (ox + phone_w, oy + phone_h)],
        radius=corner_radius,
        fill=hex_to_rgb("#080808"),
        outline=hex_to_rgb(GOLD),
        width=2
    )

    # Screen area
    screen_x1 = ox + screen_margin
    screen_y1 = oy + screen_margin
    screen_x2 = ox + phone_w - screen_margin
    screen_y2 = oy + phone_h - screen_margin
    screen_w = screen_x2 - screen_x1
    screen_h = screen_y2 - screen_y1

    # Create screen background with gradient (matching app)
    screen_bg = create_diagonal_gradient(screen_w, screen_h, PRIMARY, SURFACE)
    screen_bg = screen_bg.convert('RGBA')

    # Create rounded mask for screen
    mask = Image.new('L', (screen_w, screen_h), 0)
    mask_draw = ImageDraw.Draw(mask)
    mask_draw.rounded_rectangle([(0, 0), (screen_w-1, screen_h-1)], radius=corner_radius-screen_margin, fill=255)

    # Apply mask and paste screen
    screen_bg.putalpha(mask)
    img.paste(screen_bg, (screen_x1, screen_y1), screen_bg)

    # Redraw on the composited image
    draw = ImageDraw.Draw(img)

    # Status bar area
    status_y = screen_y1 + 15
    draw.text((screen_x1 + screen_w//2 - 15, status_y), "9:41", fill=hex_to_rgb(TEXT_PRIMARY))

    # Dynamic Island / Notch
    notch_w, notch_h = 90, 28
    notch_x = screen_x1 + (screen_w - notch_w) // 2
    notch_y = screen_y1 + 8
    draw.rounded_rectangle(
        [(notch_x, notch_y), (notch_x + notch_w, notch_y + notch_h)],
        radius=14,
        fill=hex_to_rgb("#000000")
    )

    # App header - "Discovery"
    header_y = screen_y1 + 55
    draw.text((screen_x1 + 20, header_y), "Discovery", fill=hex_to_rgb(TEXT_PRIMARY))

    # Likes counter badge (top right)
    badge_x = screen_x2 - 60
    badge_y = header_y - 2
    draw.rounded_rectangle(
        [(badge_x, badge_y), (badge_x + 45, badge_y + 24)],
        radius=12,
        fill=hex_to_rgba(SUCCESS, 50),
        outline=hex_to_rgb(SUCCESS),
        width=1
    )
    # Heart icon representation
    draw.ellipse([(badge_x + 6, badge_y + 6), (badge_x + 18, badge_y + 18)], fill=hex_to_rgb(SUCCESS))
    draw.text((badge_x + 24, badge_y + 4), "5", fill=hex_to_rgb(SUCCESS))

    # Profile Card
    card_margin = 16
    card_x1 = screen_x1 + card_margin
    card_y1 = header_y + 40
    card_x2 = screen_x2 - card_margin
    card_y2 = screen_y2 - 100
    card_w = card_x2 - card_x1
    card_h = card_y2 - card_y1

    # Card background with gradient overlay
    card_bg = create_diagonal_gradient(card_w, card_h, PRIMARY, SURFACE)
    card_bg = card_bg.convert('RGBA')

    # Apply transparency to show purple gradient effect
    card_pixels = card_bg.load()
    for y in range(card_h):
        for x in range(card_w):
            r, g, b, a = card_pixels[x, y]
            # Blend with surface color to reduce saturation
            card_pixels[x, y] = (
                int(r * 0.4 + hex_to_rgb(SURFACE)[0] * 0.6),
                int(g * 0.4 + hex_to_rgb(SURFACE)[1] * 0.6),
                int(b * 0.4 + hex_to_rgb(SURFACE)[2] * 0.6),
                255
            )

    # Create card mask
    card_mask = Image.new('L', (card_w, card_h), 0)
    card_mask_draw = ImageDraw.Draw(card_mask)
    card_mask_draw.rounded_rectangle([(0, 0), (card_w-1, card_h-1)], radius=16, fill=255)
    card_bg.putalpha(card_mask)

    img.paste(card_bg, (card_x1, card_y1), card_bg)
    draw = ImageDraw.Draw(img)

    # Card gold border
    draw.rounded_rectangle(
        [(card_x1, card_y1), (card_x2, card_y2)],
        radius=16,
        outline=hex_to_rgba(GOLD, 77),  # 0.3 opacity
        width=1
    )

    # Profile photo area (placeholder with gradient)
    photo_margin = 20
    photo_x1 = card_x1 + photo_margin
    photo_y1 = card_y1 + photo_margin
    photo_x2 = card_x2 - photo_margin
    photo_y2 = card_y1 + 280
    photo_w = photo_x2 - photo_x1
    photo_h = photo_y2 - photo_y1

    # Create photo placeholder with subtle gradient
    photo_bg = create_gradient_vertical(photo_w, photo_h, "#3a3a3a", "#252525")
    photo_bg = photo_bg.convert('RGBA')

    # Photo rounded corners
    photo_mask = Image.new('L', (photo_w, photo_h), 0)
    photo_mask_draw = ImageDraw.Draw(photo_mask)
    photo_mask_draw.rounded_rectangle([(0, 0), (photo_w-1, photo_h-1)], radius=12, fill=255)
    photo_bg.putalpha(photo_mask)

    img.paste(photo_bg, (photo_x1, photo_y1), photo_bg)
    draw = ImageDraw.Draw(img)

    # Person silhouette in photo area
    center_x = (photo_x1 + photo_x2) // 2
    center_y = (photo_y1 + photo_y2) // 2

    # Head
    head_r = 35
    draw.ellipse(
        [(center_x - head_r, center_y - 60 - head_r), (center_x + head_r, center_y - 60 + head_r)],
        fill=hex_to_rgba("#555555", 200)
    )
    # Shoulders
    draw.arc(
        [(center_x - 60, center_y - 30), (center_x + 60, center_y + 50)],
        180, 0,
        fill=hex_to_rgba("#555555", 200),
        width=40
    )

    # Photo dots indicator
    dot_y = photo_y2 - 15
    for i in range(3):
        dot_x = center_x - 20 + (i * 20)
        color = TEXT_PRIMARY if i == 0 else TEXT_MUTED
        draw.ellipse([(dot_x - 4, dot_y - 4), (dot_x + 4, dot_y + 4)], fill=hex_to_rgb(color))

    # Profile name and age
    name_y = photo_y2 + 20
    draw.text((card_x1 + 24, name_y), "Sophia, 26", fill=hex_to_rgb(TEXT_PRIMARY))

    # Bio text
    bio_y = name_y + 35
    draw.text((card_x1 + 24, bio_y), "Creative soul seeking", fill=hex_to_rgb(TEXT_SECONDARY))
    draw.text((card_x1 + 24, bio_y + 22), "genuine connections", fill=hex_to_rgb(TEXT_SECONDARY))

    # Gold divider
    divider_y = bio_y + 60
    draw.line(
        [(card_x1 + 24, divider_y), (card_x2 - 24, divider_y)],
        fill=hex_to_rgba(GOLD, 77),
        width=1
    )

    # Interests section
    interests_label_y = divider_y + 15
    draw.text((card_x1 + 24, interests_label_y), "Interests", fill=hex_to_rgb(GOLD))

    # Interest chips
    interests = ["Travel", "Photography", "Art"]
    chip_y = interests_label_y + 28
    chip_x = card_x1 + 24

    for interest in interests:
        chip_w = len(interest) * 9 + 20
        # Chip background
        draw.rounded_rectangle(
            [(chip_x, chip_y), (chip_x + chip_w, chip_y + 28)],
            radius=14,
            fill=hex_to_rgba(GOLD, 38),  # 0.15 opacity
            outline=hex_to_rgba(GOLD, 77),  # 0.3 opacity
            width=1
        )
        draw.text((chip_x + 10, chip_y + 5), interest, fill=hex_to_rgb(GOLD))
        chip_x += chip_w + 10

    # Bottom action buttons
    btn_y = screen_y2 - 70
    btn_size = 50

    # Pass button (X) - Crimson
    pass_x = screen_x1 + screen_w // 4
    draw.ellipse(
        [(pass_x - btn_size//2, btn_y), (pass_x + btn_size//2, btn_y + btn_size)],
        fill=hex_to_rgb(CRIMSON)
    )
    # X mark
    offset = 12
    draw.line(
        [(pass_x - offset, btn_y + btn_size//2 - offset), (pass_x + offset, btn_y + btn_size//2 + offset)],
        fill=hex_to_rgb("#FFFFFF"),
        width=3
    )
    draw.line(
        [(pass_x - offset, btn_y + btn_size//2 + offset), (pass_x + offset, btn_y + btn_size//2 - offset)],
        fill=hex_to_rgb("#FFFFFF"),
        width=3
    )

    # Like button (Heart) - Green
    like_x = screen_x1 + 3 * screen_w // 4
    draw.ellipse(
        [(like_x - btn_size//2, btn_y), (like_x + btn_size//2, btn_y + btn_size)],
        fill=hex_to_rgb(SUCCESS)
    )
    # Heart shape (simplified)
    heart_cx = like_x
    heart_cy = btn_y + btn_size//2
    draw.polygon([
        (heart_cx, heart_cy + 15),  # Bottom point
        (heart_cx - 15, heart_cy - 5),
        (heart_cx - 12, heart_cy - 12),
        (heart_cx, heart_cy - 5),
        (heart_cx + 12, heart_cy - 12),
        (heart_cx + 15, heart_cy - 5),
    ], fill=hex_to_rgb("#FFFFFF"))

    # Swipe hint text
    hint_y = btn_y + btn_size + 15
    hint_text = "Swipe to interact"
    # Center the text approximately
    draw.text((screen_x1 + screen_w//2 - 55, hint_y), hint_text, fill=hex_to_rgba(TEXT_MUTED, 150))

    # Bottom navigation bar
    nav_y = screen_y2 - 20
    nav_h = 20

    # Nav dots/icons (simplified)
    nav_icons_x = [screen_x1 + screen_w * i // 5 + screen_w // 10 for i in range(4)]
    nav_labels = ["Discover", "Matches", "Chat", "Profile"]

    for i, x in enumerate(nav_icons_x):
        color = GOLD if i == 0 else TEXT_MUTED
        draw.ellipse([(x - 6, nav_y - 3), (x + 6, nav_y + 9)], fill=hex_to_rgb(color))

    # Add gold glow effect around the phone
    glow_img = Image.new('RGBA', img.size, (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_img)
    glow_draw.rounded_rectangle(
        [(ox - 5, oy - 5), (ox + phone_w + 5, oy + phone_h + 5)],
        radius=corner_radius + 5,
        fill=hex_to_rgba(GOLD, 40)
    )
    glow_img = glow_img.filter(ImageFilter.GaussianBlur(radius=20))

    # Composite glow behind phone
    final_img = Image.new('RGBA', img.size, (0, 0, 0, 0))
    final_img.paste(glow_img, (0, 0), glow_img)
    final_img.paste(img, (0, 0), img)

    final_img.save("assets/generated/app_mockup.png")
    print("Generated: app_mockup.png (realistic app design)")


# --- Feature Icons (unchanged from before) ---

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
    draw.rounded_rectangle([(15, 35), (113, 93)], radius=8, outline=gold, width=4)
    draw.rectangle([(15, 50), (113, 62)], fill=gold)
    draw.line([(75, 75), (88, 88), (110, 55)], fill=gold, width=4)


def draw_nopay_icon(draw, size):
    """No Pay-to-Win - Crossed out coins"""
    gold = hex_to_rgb(GOLD)
    draw.ellipse([(25, 25), (103, 103)], outline=gold, width=4)
    draw.line([(64, 40), (64, 88)], fill=gold, width=3)
    draw.arc([(48, 40), (80, 65)], 0, 180, fill=gold, width=3)
    draw.arc([(48, 63), (80, 88)], 180, 0, fill=gold, width=3)
    draw.line([(30, 30), (98, 98)], fill=hex_to_rgb(CRIMSON), width=5)


def draw_human_icon(draw, size):
    """Real Humans - Person with checkmark"""
    gold = hex_to_rgb(GOLD)
    draw.ellipse([(44, 15), (84, 55)], outline=gold, width=4)
    draw.arc([(30, 55), (98, 115)], 180, 0, fill=gold, width=4)
    draw.ellipse([(80, 70), (115, 105)], fill=gold)
    draw.line([(88, 88), (95, 95), (108, 78)], fill=hex_to_rgb(BACKGROUND), width=3)


def draw_lock_icon(draw, size):
    """Privacy Lock"""
    gold = hex_to_rgb(GOLD)
    draw.rounded_rectangle([(35, 55), (93, 105)], radius=8, outline=gold, width=4)
    draw.arc([(42, 25), (86, 70)], 180, 0, fill=gold, width=4)
    draw.ellipse([(58, 70), (70, 82)], fill=gold)
    draw.rectangle([(61, 78), (67, 92)], fill=gold)


def draw_bouncer_icon(draw, size):
    """Paywall Bouncer - Velvet rope"""
    gold = hex_to_rgb(GOLD)
    crimson = hex_to_rgb(CRIMSON)
    draw.rectangle([(25, 30), (35, 100)], fill=gold)
    draw.ellipse([(22, 22), (38, 38)], fill=gold)
    draw.rectangle([(93, 30), (103, 100)], fill=gold)
    draw.ellipse([(90, 22), (106, 38)], fill=gold)
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
