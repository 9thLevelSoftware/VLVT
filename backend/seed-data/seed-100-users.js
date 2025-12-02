#!/usr/bin/env node

/**
 * VLVT Test Database Seeding Script - 100 Users
 *
 * Creates 100 test accounts for comprehensive testing:
 * - 95 premium subscribers
 * - 5 free (non-subscriber) users
 * - All in the same geographic area (Los Angeles)
 * - All with email/password auth (password: "Password")
 *
 * Usage:
 *   node seed-100-users.js                    # Seed the database
 *   node seed-100-users.js --clean            # Clean test data first, then seed
 *   node seed-100-users.js --clean-only       # Only clean test data
 *   node seed-100-users.js --preserve-reviewer # Keep Google Reviewer account
 *
 * Environment Variables:
 *   DATABASE_URL - PostgreSQL connection string
 */

const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nobsdating',
});

// Parse command line arguments
const args = process.argv.slice(2);
const shouldClean = args.includes('--clean');
const cleanOnly = args.includes('--clean-only');
const preserveReviewer = args.includes('--preserve-reviewer');

// Los Angeles area coordinates (all users within ~10 mile radius)
const LA_CENTER = { lat: 34.0522, lng: -118.2437 };

// Test user data - 100 diverse profiles
const TEST_USERS = [
  // NON-SUBSCRIBERS (5 users: test_user_001 to test_user_005)
  { num: 1, name: 'Emma Thompson', age: 24, bio: 'Just joined! Looking to meet new people. Love hiking and coffee ☕', interests: ['Hiking', 'Coffee', 'Photography'], subscriber: false },
  { num: 2, name: 'Liam Johnson', age: 26, bio: 'New here, curious to explore. Music lover and weekend chef 🎸', interests: ['Music', 'Cooking', 'Guitar'], subscriber: false },
  { num: 3, name: 'Sophia Martinez', age: 23, bio: 'Testing the waters! Yoga enthusiast and bookworm 📚', interests: ['Yoga', 'Reading', 'Meditation'], subscriber: false },
  { num: 4, name: 'Noah Williams', age: 25, bio: 'Free spirit, new to dating apps. Surfer and dog dad 🏄', interests: ['Surfing', 'Dogs', 'Beach'], subscriber: false },
  { num: 5, name: 'Olivia Brown', age: 27, bio: 'Checking this out! Artist and wine enthusiast 🎨', interests: ['Art', 'Wine', 'Museums'], subscriber: false },

  // SUBSCRIBERS (95 users: test_user_006 to test_user_100)
  { num: 6, name: 'James Davis', age: 28, bio: 'Software engineer who loves outdoor adventures. Looking for my adventure partner! 🏔️', interests: ['Hiking', 'Technology', 'Travel', 'Photography'], subscriber: true },
  { num: 7, name: 'Ava Wilson', age: 25, bio: 'Yoga instructor and plant mom. Let\'s grab matcha and talk about life 🌿', interests: ['Yoga', 'Plants', 'Coffee', 'Wellness'], subscriber: true },
  { num: 8, name: 'William Moore', age: 30, bio: 'Finance by day, DJ by night. Music is my love language 🎧', interests: ['Music', 'DJing', 'Festivals', 'Dancing'], subscriber: true },
  { num: 9, name: 'Isabella Taylor', age: 26, bio: 'Foodie and travel addict. Always planning the next trip ✈️', interests: ['Travel', 'Food', 'Photography', 'Adventure'], subscriber: true },
  { num: 10, name: 'Benjamin Anderson', age: 29, bio: 'Personal trainer helping people crush their goals. Let\'s get active together 💪', interests: ['Fitness', 'Health', 'Running', 'Nutrition'], subscriber: true },
  { num: 11, name: 'Mia Thomas', age: 24, bio: 'Graphic designer with a passion for coffee and creativity ☕', interests: ['Design', 'Art', 'Coffee', 'Photography'], subscriber: true },
  { num: 12, name: 'Lucas Jackson', age: 31, bio: 'Chef who believes food is love. Looking for a taste tester 👨‍🍳', interests: ['Cooking', 'Food', 'Wine', 'Travel'], subscriber: true },
  { num: 13, name: 'Charlotte White', age: 27, bio: 'Marketing guru and podcast junkie. Tell me your favorite show! 🎙️', interests: ['Marketing', 'Podcasts', 'Books', 'Coffee'], subscriber: true },
  { num: 14, name: 'Henry Harris', age: 28, bio: 'Architect designing dreams. Lover of modern design and old movies 🏛️', interests: ['Architecture', 'Design', 'Movies', 'Art'], subscriber: true },
  { num: 15, name: 'Amelia Martin', age: 25, bio: 'Nurse with a heart of gold. Dog mom to two rescues 🐕', interests: ['Healthcare', 'Dogs', 'Hiking', 'Volunteering'], subscriber: true },
  { num: 16, name: 'Alexander Garcia', age: 32, bio: 'Entrepreneur building cool things. Work hard, play harder 🚀', interests: ['Startups', 'Technology', 'Travel', 'Golf'], subscriber: true },
  { num: 17, name: 'Harper Rodriguez', age: 23, bio: 'Aspiring photographer capturing moments. Let\'s create memories 📸', interests: ['Photography', 'Art', 'Travel', 'Nature'], subscriber: true },
  { num: 18, name: 'Daniel Martinez', age: 29, bio: 'Doctor who still finds time for hobbies. Tennis player and wine collector 🍷', interests: ['Tennis', 'Wine', 'Medicine', 'Reading'], subscriber: true },
  { num: 19, name: 'Evelyn Hernandez', age: 26, bio: 'Teacher shaping young minds. Musical theater nerd 🎭', interests: ['Teaching', 'Theater', 'Music', 'Reading'], subscriber: true },
  { num: 20, name: 'Michael Lopez', age: 30, bio: 'Real estate agent who loves hiking and breweries 🍺', interests: ['Real Estate', 'Hiking', 'Beer', 'Travel'], subscriber: true },
  { num: 21, name: 'Abigail Gonzalez', age: 24, bio: 'Data scientist by day, salsa dancer by night 💃', interests: ['Data Science', 'Dancing', 'Latin Music', 'Fitness'], subscriber: true },
  { num: 22, name: 'Ethan Wilson', age: 27, bio: 'Lawyer with a sense of humor. Looking for my debate partner ⚖️', interests: ['Law', 'Debate', 'Comedy', 'Wine'], subscriber: true },
  { num: 23, name: 'Emily Anderson', age: 25, bio: 'Interior designer obsessed with mid-century modern. Plant collector 🪴', interests: ['Interior Design', 'Plants', 'Art', 'Vintage'], subscriber: true },
  { num: 24, name: 'Matthew Thomas', age: 33, bio: 'Pilot who\'s seen the world. Looking for a co-pilot in life ✈️', interests: ['Aviation', 'Travel', 'Photography', 'Adventure'], subscriber: true },
  { num: 25, name: 'Elizabeth Jackson', age: 28, bio: 'Veterinarian and animal lover. Will definitely show you pet photos 🐾', interests: ['Animals', 'Veterinary', 'Hiking', 'Nature'], subscriber: true },
  { num: 26, name: 'David White', age: 29, bio: 'Film editor and cinema enthusiast. Let\'s watch classics together 🎬', interests: ['Film', 'Movies', 'Photography', 'Music'], subscriber: true },
  { num: 27, name: 'Sofia Harris', age: 24, bio: 'Fashion designer with an eye for style. Thrift shopping pro 👗', interests: ['Fashion', 'Design', 'Vintage', 'Art'], subscriber: true },
  { num: 28, name: 'Joseph Martin', age: 31, bio: 'Mechanical engineer who builds things. Motorcycle enthusiast 🏍️', interests: ['Engineering', 'Motorcycles', 'Travel', 'Cars'], subscriber: true },
  { num: 29, name: 'Victoria Garcia', age: 26, bio: 'Psychologist helping people thrive. Deep conversations are my thing 🧠', interests: ['Psychology', 'Books', 'Yoga', 'Coffee'], subscriber: true },
  { num: 30, name: 'Samuel Rodriguez', age: 28, bio: 'Accountant by day, gamer by night. Looking for my Player 2 🎮', interests: ['Gaming', 'Finance', 'Movies', 'Technology'], subscriber: true },
  { num: 31, name: 'Grace Martinez', age: 25, bio: 'Dancer and choreographer. Life is better when you\'re dancing 💫', interests: ['Dance', 'Music', 'Fitness', 'Art'], subscriber: true },
  { num: 32, name: 'Christopher Hernandez', age: 30, bio: 'Sports journalist covering all the action. Huge basketball fan 🏀', interests: ['Sports', 'Writing', 'Basketball', 'Travel'], subscriber: true },
  { num: 33, name: 'Chloe Lopez', age: 23, bio: 'Social media manager creating content. Meme enthusiast 📱', interests: ['Social Media', 'Marketing', 'Comedy', 'Photography'], subscriber: true },
  { num: 34, name: 'Andrew Gonzalez', age: 32, bio: 'Dentist with a great smile. Hiking and photography on weekends 😁', interests: ['Healthcare', 'Hiking', 'Photography', 'Travel'], subscriber: true },
  { num: 35, name: 'Zoey Wilson', age: 27, bio: 'Event planner making magic happen. Life of the party 🎉', interests: ['Events', 'Planning', 'Music', 'Travel'], subscriber: true },
  { num: 36, name: 'Joshua Anderson', age: 29, bio: 'Environmental scientist fighting climate change. Ocean lover 🌊', interests: ['Environment', 'Science', 'Ocean', 'Surfing'], subscriber: true },
  { num: 37, name: 'Lily Thomas', age: 24, bio: 'Pastry chef creating sweet dreams. Brunch is my love language 🥐', interests: ['Baking', 'Food', 'Coffee', 'Art'], subscriber: true },
  { num: 38, name: 'Ryan Jackson', age: 28, bio: 'Physical therapist helping people move better. Basketball player 🏀', interests: ['Physical Therapy', 'Basketball', 'Fitness', 'Health'], subscriber: true },
  { num: 39, name: 'Hannah White', age: 26, bio: 'Journalist chasing stories. Always curious, always asking questions 📰', interests: ['Journalism', 'Writing', 'Travel', 'Politics'], subscriber: true },
  { num: 40, name: 'Nathan Harris', age: 31, bio: 'Music producer making beats. Looking for my muse 🎵', interests: ['Music Production', 'DJing', 'Concerts', 'Technology'], subscriber: true },
  { num: 41, name: 'Addison Martin', age: 25, bio: 'Makeup artist and beauty enthusiast. Confidence is beautiful 💄', interests: ['Makeup', 'Beauty', 'Fashion', 'Art'], subscriber: true },
  { num: 42, name: 'Dylan Garcia', age: 27, bio: 'Firefighter and adrenaline junkie. Hero by profession 🚒', interests: ['Firefighting', 'Fitness', 'Adventure', 'Sports'], subscriber: true },
  { num: 43, name: 'Natalie Rodriguez', age: 24, bio: 'Marine biologist saving the oceans. Scuba certified 🤿', interests: ['Marine Biology', 'Scuba Diving', 'Travel', 'Science'], subscriber: true },
  { num: 44, name: 'Caleb Martinez', age: 30, bio: 'Software architect building the future. Board game strategist 🎲', interests: ['Technology', 'Board Games', 'Strategy', 'Coffee'], subscriber: true },
  { num: 45, name: 'Audrey Hernandez', age: 26, bio: 'HR manager and people person. Wine and cheese enthusiast 🧀', interests: ['Human Resources', 'Wine', 'Networking', 'Travel'], subscriber: true },
  { num: 46, name: 'Owen Lopez', age: 29, bio: 'Construction manager building dreams. DIY expert 🔨', interests: ['Construction', 'DIY', 'Real Estate', 'Camping'], subscriber: true },
  { num: 47, name: 'Leah Gonzalez', age: 25, bio: 'Nutritionist helping people eat better. Meal prep queen 🥗', interests: ['Nutrition', 'Cooking', 'Fitness', 'Wellness'], subscriber: true },
  { num: 48, name: 'Isaac Wilson', age: 28, bio: 'Pharmacist with a science obsession. Trivia night champion 🧪', interests: ['Pharmacy', 'Science', 'Trivia', 'Reading'], subscriber: true },
  { num: 49, name: 'Savannah Anderson', age: 23, bio: 'Model and aspiring actress. Living the dream ⭐', interests: ['Modeling', 'Acting', 'Fashion', 'Fitness'], subscriber: true },
  { num: 50, name: 'Luke Thomas', age: 32, bio: 'Investment banker with work-life balance. Golf and good wine 🍷', interests: ['Finance', 'Golf', 'Wine', 'Travel'], subscriber: true },
  { num: 51, name: 'Brooklyn Jackson', age: 27, bio: 'UX designer making apps beautiful. Cat mom 🐱', interests: ['UX Design', 'Technology', 'Cats', 'Art'], subscriber: true },
  { num: 52, name: 'Gabriel White', age: 29, bio: 'Police officer serving the community. Gym rat and movie buff 🏋️', interests: ['Law Enforcement', 'Fitness', 'Movies', 'Sports'], subscriber: true },
  { num: 53, name: 'Skylar Harris', age: 24, bio: 'Florist creating beautiful arrangements. Nature lover 🌸', interests: ['Floristry', 'Nature', 'Art', 'Gardening'], subscriber: true },
  { num: 54, name: 'Carter Martin', age: 30, bio: 'Product manager shipping features. Craft beer connoisseur 🍺', interests: ['Product Management', 'Technology', 'Beer', 'Hiking'], subscriber: true },
  { num: 55, name: 'Stella Garcia', age: 26, bio: 'Occupational therapist making a difference. Bookclub regular 📖', interests: ['Therapy', 'Books', 'Yoga', 'Volunteering'], subscriber: true },
  { num: 56, name: 'Jayden Rodriguez', age: 28, bio: 'Electrician lighting up the world. Classic car enthusiast 🚗', interests: ['Trades', 'Cars', 'Mechanics', 'Camping'], subscriber: true },
  { num: 57, name: 'Penelope Martinez', age: 25, bio: 'Influencer and content creator. Coffee addict ☕', interests: ['Social Media', 'Content Creation', 'Coffee', 'Travel'], subscriber: true },
  { num: 58, name: 'Levi Hernandez', age: 31, bio: 'Chiropractor helping people feel better. Yoga practitioner 🧘', interests: ['Chiropractic', 'Yoga', 'Health', 'Fitness'], subscriber: true },
  { num: 59, name: 'Claire Lopez', age: 24, bio: 'Barista and coffee snob. Latte art is my specialty ☕', interests: ['Coffee', 'Art', 'Music', 'Reading'], subscriber: true },
  { num: 60, name: 'Hunter Gonzalez', age: 27, bio: 'Park ranger protecting nature. Outdoor enthusiast 🌲', interests: ['Nature', 'Hiking', 'Wildlife', 'Photography'], subscriber: true },
  { num: 61, name: 'Nora Wilson', age: 26, bio: 'Speech therapist changing lives. Broadway show fanatic 🎭', interests: ['Speech Therapy', 'Theater', 'Music', 'Books'], subscriber: true },
  { num: 62, name: 'Eli Anderson', age: 29, bio: 'Cybersecurity expert keeping data safe. Escape room enthusiast 🔐', interests: ['Cybersecurity', 'Technology', 'Puzzles', 'Gaming'], subscriber: true },
  { num: 63, name: 'Ruby Thomas', age: 23, bio: 'Dance teacher spreading joy. Brunch is life 💃', interests: ['Dance', 'Teaching', 'Brunch', 'Music'], subscriber: true },
  { num: 64, name: 'Miles Jackson', age: 30, bio: 'Aerospace engineer reaching for the stars. Space nerd 🚀', interests: ['Aerospace', 'Science', 'Space', 'Technology'], subscriber: true },
  { num: 65, name: 'Hazel White', age: 25, bio: 'Photographer capturing love stories. Hopeless romantic 📷', interests: ['Photography', 'Weddings', 'Art', 'Travel'], subscriber: true },
  { num: 66, name: 'Leo Harris', age: 28, bio: 'Personal chef cooking up experiences. Farmers market regular 🥕', interests: ['Cooking', 'Food', 'Farmers Markets', 'Wine'], subscriber: true },
  { num: 67, name: 'Aurora Martin', age: 24, bio: 'Kindergarten teacher with endless patience. Arts and crafts lover 🎨', interests: ['Teaching', 'Art', 'Crafts', 'Kids'], subscriber: true },
  { num: 68, name: 'Jack Garcia', age: 31, bio: 'Civil engineer building infrastructure. Mountain biking on weekends 🚵', interests: ['Engineering', 'Mountain Biking', 'Outdoor', 'Travel'], subscriber: true },
  { num: 69, name: 'Luna Rodriguez', age: 26, bio: 'Acupuncturist and wellness advocate. Meditation guide 🧘', interests: ['Acupuncture', 'Wellness', 'Meditation', 'Yoga'], subscriber: true },
  { num: 70, name: 'Asher Martinez', age: 29, bio: 'Sales director closing deals. Wine club member 🍷', interests: ['Sales', 'Wine', 'Golf', 'Networking'], subscriber: true },
  { num: 71, name: 'Violet Hernandez', age: 25, bio: 'Art therapist helping through creativity. Museum hopper 🖼️', interests: ['Art Therapy', 'Art', 'Museums', 'Psychology'], subscriber: true },
  { num: 72, name: 'Ezra Lopez', age: 27, bio: 'Game developer creating worlds. Esports fan 🎮', interests: ['Game Development', 'Gaming', 'Esports', 'Technology'], subscriber: true },
  { num: 73, name: 'Ivy Gonzalez', age: 24, bio: 'Dental hygienist with the best smile tips. Hiking enthusiast 🦷', interests: ['Healthcare', 'Hiking', 'Fitness', 'Travel'], subscriber: true },
  { num: 74, name: 'Grayson Wilson', age: 30, bio: 'Brewery owner crafting happiness. Beer and music lover 🍻', interests: ['Brewing', 'Beer', 'Music', 'Business'], subscriber: true },
  { num: 75, name: 'Willow Anderson', age: 26, bio: 'Librarian and book advocate. Cozy coffee shop regular 📚', interests: ['Books', 'Library', 'Coffee', 'Writing'], subscriber: true },
  { num: 76, name: 'Adam Thomas', age: 28, bio: 'Physical education teacher staying active. Soccer coach ⚽', interests: ['Teaching', 'Soccer', 'Fitness', 'Sports'], subscriber: true },
  { num: 77, name: 'Ellie Jackson', age: 25, bio: 'Social worker making a difference. Podcast host 🎙️', interests: ['Social Work', 'Podcasts', 'Volunteering', 'Books'], subscriber: true },
  { num: 78, name: 'Hudson White', age: 32, bio: 'Surgeon with steady hands. Jazz and whiskey nights 🎷', interests: ['Medicine', 'Jazz', 'Whiskey', 'Art'], subscriber: true },
  { num: 79, name: 'Aria Harris', age: 24, bio: 'Pilates instructor with zen vibes. Smoothie bowl artist 🥣', interests: ['Pilates', 'Wellness', 'Healthy Food', 'Yoga'], subscriber: true },
  { num: 80, name: 'Kai Martin', age: 29, bio: 'Surfer and surf instructor. Beach life is the best life 🏄', interests: ['Surfing', 'Beach', 'Fitness', 'Travel'], subscriber: true },
  { num: 81, name: 'Scarlett Garcia', age: 27, bio: 'PR specialist spinning stories. Red carpet events 🌟', interests: ['Public Relations', 'Events', 'Fashion', 'Networking'], subscriber: true },
  { num: 82, name: 'Lincoln Rodriguez', age: 30, bio: 'Furniture maker crafting with wood. Vintage collector 🪑', interests: ['Woodworking', 'Crafts', 'Vintage', 'Design'], subscriber: true },
  { num: 83, name: 'Maya Martinez', age: 25, bio: 'Yoga retreat organizer. Travel and mindfulness 🧘‍♀️', interests: ['Yoga', 'Travel', 'Mindfulness', 'Wellness'], subscriber: true },
  { num: 84, name: 'Jaxon Hernandez', age: 28, bio: 'Paramedic saving lives daily. Mountain climbing on days off 🏔️', interests: ['Emergency Medicine', 'Climbing', 'Fitness', 'Adventure'], subscriber: true },
  { num: 85, name: 'Elena Lopez', age: 26, bio: 'Wedding planner creating perfect days. Rom-com enthusiast 💒', interests: ['Event Planning', 'Weddings', 'Movies', 'Travel'], subscriber: true },
  { num: 86, name: 'Maverick Gonzalez', age: 31, bio: 'Helicopter pilot with the best views. Adrenaline seeker 🚁', interests: ['Aviation', 'Adventure', 'Travel', 'Photography'], subscriber: true },
  { num: 87, name: 'Aaliyah Wilson', age: 24, bio: 'Music teacher sharing the gift of music. Concert goer 🎹', interests: ['Music', 'Teaching', 'Concerts', 'Piano'], subscriber: true },
  { num: 88, name: 'Carson Anderson', age: 29, bio: 'Optometrist with 20/20 vision for fun. Tennis player 🎾', interests: ['Healthcare', 'Tennis', 'Fitness', 'Travel'], subscriber: true },
  { num: 89, name: 'Bella Thomas', age: 25, bio: 'Massage therapist melting stress away. Nature walks 🌳', interests: ['Massage Therapy', 'Wellness', 'Nature', 'Yoga'], subscriber: true },
  { num: 90, name: 'Dominic Jackson', age: 27, bio: 'Video editor creating visual magic. Film buff 🎬', interests: ['Video Editing', 'Film', 'Photography', 'Technology'], subscriber: true },
  { num: 91, name: 'Paisley White', age: 24, bio: 'Pet groomer making dogs fabulous. Dog park regular 🐕', interests: ['Pet Care', 'Dogs', 'Animals', 'Hiking'], subscriber: true },
  { num: 92, name: 'Roman Harris', age: 30, bio: 'Real estate investor building wealth. Networking pro 🏠', interests: ['Real Estate', 'Investing', 'Networking', 'Golf'], subscriber: true },
  { num: 93, name: 'Quinn Martin', age: 26, bio: 'Dermatologist with great skin tips. Skincare obsessed 💆', interests: ['Dermatology', 'Skincare', 'Wellness', 'Fashion'], subscriber: true },
  { num: 94, name: 'Sawyer Garcia', age: 28, bio: 'Ski instructor living the mountain life. Snowboarder too 🎿', interests: ['Skiing', 'Snowboarding', 'Mountains', 'Travel'], subscriber: true },
  { num: 95, name: 'Madelyn Rodriguez', age: 25, bio: 'Brand strategist with creative ideas. Networking events 💡', interests: ['Marketing', 'Branding', 'Events', 'Fashion'], subscriber: true },
  { num: 96, name: 'Bentley Martinez', age: 31, bio: 'Sommelier with refined taste. Wine tour guide 🍇', interests: ['Wine', 'Travel', 'Food', 'Hospitality'], subscriber: true },
  { num: 97, name: 'Piper Hernandez', age: 24, bio: 'Flight attendant seeing the world. Travel tips expert ✈️', interests: ['Travel', 'Aviation', 'Photography', 'Adventure'], subscriber: true },
  { num: 98, name: 'Axel Lopez', age: 29, bio: 'Personal injury lawyer fighting for justice. Boxing gym member 🥊', interests: ['Law', 'Boxing', 'Fitness', 'Justice'], subscriber: true },
  { num: 99, name: 'Adalyn Gonzalez', age: 26, bio: 'Dietitian helping healthy choices. Cooking class instructor 🥗', interests: ['Nutrition', 'Cooking', 'Health', 'Fitness'], subscriber: true },
  { num: 100, name: 'Ryder Brooks', age: 27, bio: 'Stunt coordinator living on the edge. Action movie fan 🎬', interests: ['Stunts', 'Film', 'Fitness', 'Adventure'], subscriber: true },
];

// Photo URLs (using pravatar.cc for consistent avatars)
const getPhotoUrl = (num) => `https://i.pravatar.cc/400?img=${(num % 70) + 1}`;

// Generate random coordinates within radius of center point
function randomLocationInArea(center, radiusMiles) {
  const radiusKm = radiusMiles * 1.60934;
  const radiusLat = radiusKm / 111.32;
  const radiusLng = radiusKm / (111.32 * Math.cos(center.lat * Math.PI / 180));

  const lat = center.lat + (Math.random() - 0.5) * 2 * radiusLat;
  const lng = center.lng + (Math.random() - 0.5) * 2 * radiusLng;

  return { lat: lat.toFixed(6), lng: lng.toFixed(6) };
}

/**
 * Clean existing test data
 */
async function cleanTestData() {
  console.log('🧹 Cleaning existing test data...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Build exclusion clause for Google Reviewer
    const reviewerExclusion = preserveReviewer ? "AND id != 'google_reviewer'" : "";
    const reviewerExclusionUserId = preserveReviewer ? "AND user_id != 'google_reviewer'" : "";

    // Delete in correct order due to foreign key constraints
    await client.query(`DELETE FROM messages WHERE match_id IN (SELECT id FROM matches WHERE user_id_1 LIKE 'test_user_%' OR user_id_2 LIKE 'test_user_%')`);
    console.log('  ✓ Removed test messages');

    await client.query(`DELETE FROM matches WHERE user_id_1 LIKE 'test_user_%' OR user_id_2 LIKE 'test_user_%'`);
    console.log('  ✓ Removed test matches');

    await client.query(`DELETE FROM user_subscriptions WHERE user_id LIKE 'test_user_%' ${reviewerExclusionUserId}`);
    console.log('  ✓ Removed test subscriptions');

    await client.query(`DELETE FROM swipes WHERE user_id LIKE 'test_user_%' OR target_user_id LIKE 'test_user_%'`);
    console.log('  ✓ Removed test swipes');

    await client.query(`DELETE FROM blocks WHERE user_id LIKE 'test_user_%' OR blocked_user_id LIKE 'test_user_%'`);
    console.log('  ✓ Removed test blocks');

    await client.query(`DELETE FROM reports WHERE reporter_id LIKE 'test_user_%' OR reported_user_id LIKE 'test_user_%'`);
    console.log('  ✓ Removed test reports');

    await client.query(`DELETE FROM auth_credentials WHERE user_id LIKE 'test_user_%' ${reviewerExclusionUserId}`);
    console.log('  ✓ Removed test auth credentials');

    await client.query(`DELETE FROM profiles WHERE user_id LIKE 'test_user_%' ${reviewerExclusionUserId}`);
    console.log('  ✓ Removed test profiles');

    await client.query(`DELETE FROM users WHERE id LIKE 'test_user_%' ${reviewerExclusion}`);
    console.log('  ✓ Removed test users');

    // Also clean old google_test accounts
    await client.query("DELETE FROM messages WHERE match_id LIKE 'test_%'");
    await client.query("DELETE FROM matches WHERE id LIKE 'test_%'");
    await client.query("DELETE FROM user_subscriptions WHERE user_id LIKE 'google_test%'");
    await client.query("DELETE FROM swipes WHERE user_id LIKE 'google_test%' OR target_user_id LIKE 'google_test%'");
    await client.query("DELETE FROM blocks WHERE user_id LIKE 'google_test%' OR blocked_user_id LIKE 'google_test%'");
    await client.query("DELETE FROM reports WHERE reporter_id LIKE 'google_test%' OR reported_user_id LIKE 'google_test%'");
    await client.query("DELETE FROM auth_credentials WHERE user_id LIKE 'google_test%'");
    await client.query("DELETE FROM profiles WHERE user_id LIKE 'google_test%'");
    await client.query("DELETE FROM users WHERE id LIKE 'google_test%'");
    console.log('  ✓ Removed old google_test accounts');

    await client.query('COMMIT');
    console.log('✅ Test data cleaned successfully!\n');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error cleaning test data:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Seed the database with 100 test users
 */
async function seedDatabase() {
  console.log('🌱 Seeding database with 100 test users...\n');

  // Hash password once (bcrypt is slow by design)
  console.log('  🔐 Hashing password...');
  const passwordHash = await bcrypt.hash('Password', 10);

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    let subscriberCount = 0;
    let nonSubscriberCount = 0;

    for (const user of TEST_USERS) {
      const userId = `test_user_${String(user.num).padStart(3, '0')}`;
      const email = `${user.name.toLowerCase().replace(' ', '.')}@test.vlvt.app`;
      const location = randomLocationInArea(LA_CENTER, 10);
      const createdDaysAgo = Math.floor(Math.random() * 60) + 1;

      // Insert user
      await client.query(`
        INSERT INTO users (id, provider, email, created_at, updated_at)
        VALUES ($1, 'email', $2, NOW() - INTERVAL '${createdDaysAgo} days', NOW() - INTERVAL '${Math.floor(createdDaysAgo / 2)} days')
        ON CONFLICT (id) DO NOTHING
      `, [userId, email]);

      // Insert auth credentials with password
      await client.query(`
        INSERT INTO auth_credentials (user_id, provider, email, password_hash, email_verified, created_at, updated_at)
        VALUES ($1, 'email', $2, $3, true, NOW() - INTERVAL '${createdDaysAgo} days', NOW())
        ON CONFLICT DO NOTHING
      `, [userId, email, passwordHash]);

      // Insert profile
      await client.query(`
        INSERT INTO profiles (user_id, name, age, bio, photos, interests, latitude, longitude, location_updated_at, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW() - INTERVAL '${createdDaysAgo} days', NOW() - INTERVAL '1 day')
        ON CONFLICT (user_id) DO NOTHING
      `, [
        userId,
        user.name,
        user.age,
        user.bio,
        [getPhotoUrl(user.num)],
        user.interests,
        location.lat,
        location.lng
      ]);

      // Insert subscription if subscriber
      if (user.subscriber) {
        subscriberCount++;
        const subId = `test_sub_${String(user.num).padStart(3, '0')}`;
        const store = Math.random() > 0.5 ? 'app_store' : 'play_store';
        await client.query(`
          INSERT INTO user_subscriptions (id, user_id, revenuecat_id, product_id, entitlement_id, is_active, will_renew, period_type, purchased_at, expires_at, store, environment, created_at, updated_at)
          VALUES ($1, $2, $3, 'premium_monthly', 'premium', true, true, 'normal', NOW() - INTERVAL '${Math.floor(Math.random() * 30)} days', NOW() + INTERVAL '${Math.floor(Math.random() * 30) + 1} days', $4, 'sandbox', NOW(), NOW())
          ON CONFLICT DO NOTHING
        `, [subId, userId, `rc_test_${user.num}`, store]);
      } else {
        nonSubscriberCount++;
      }

      // Progress indicator
      if (user.num % 10 === 0) {
        console.log(`  📝 Created ${user.num}/100 users...`);
      }
    }

    await client.query('COMMIT');

    console.log('\n✅ Database seeded successfully!');
    console.log(`  ✓ Created 100 test users`);
    console.log(`  ✓ ${subscriberCount} premium subscribers`);
    console.log(`  ✓ ${nonSubscriberCount} free users (non-subscribers)`);
    console.log(`  ✓ All users located in Los Angeles area`);
    console.log(`  ✓ All users have password: "Password"`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error seeding database:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Display test user information
 */
async function displayTestUsers() {
  console.log('\n📋 Test Users Created:');
  console.log('═══════════════════════════════════════════════════════════════════════════════\n');

  console.log('NON-SUBSCRIBERS (Free Users):');
  console.log('─────────────────────────────────────────────────────────────────────────────');

  for (let i = 1; i <= 5; i++) {
    const user = TEST_USERS[i - 1];
    const email = `${user.name.toLowerCase().replace(' ', '.')}@test.vlvt.app`;
    console.log(`  ${i}. ${user.name} (${user.age}) - ${email}`);
  }

  console.log('\nSUBSCRIBERS (Premium Users):');
  console.log('─────────────────────────────────────────────────────────────────────────────');

  for (let i = 6; i <= 100; i++) {
    const user = TEST_USERS[i - 1];
    const email = `${user.name.toLowerCase().replace(' ', '.')}@test.vlvt.app`;
    console.log(`  ${i}. ${user.name} (${user.age}) - ${email}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════════════════════════');
  console.log('\n💡 Login Instructions:');
  console.log('   Email: [firstname].[lastname]@test.vlvt.app');
  console.log('   Password: Password');
  console.log('\n   Example: emma.thompson@test.vlvt.app / Password');
  console.log('\n   All users are in the Los Angeles area and can discover each other.\n');
}

/**
 * Main execution
 */
async function main() {
  try {
    console.log('\n🚀 VLVT 100-User Test Data Seeder\n');

    if (preserveReviewer) {
      console.log('📌 Preserving Google Reviewer account\n');
    }

    if (cleanOnly) {
      await cleanTestData();
    } else {
      if (shouldClean) {
        await cleanTestData();
      }
      await seedDatabase();
      await displayTestUsers();
    }

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n💥 Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
}

// Run the script
main();
