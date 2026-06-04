-- ─────────────────────────────────────────
-- Joolies (Date Sours) Creator Brief — June 2026
-- Populates brief_sections for the /joolies Brief tab from the
-- TikTok Live talking-points playbook. Safe to re-run (idempotent).
-- ─────────────────────────────────────────

DO $$
DECLARE jo UUID;
BEGIN
  SELECT id INTO jo FROM clients WHERE slug = 'joolies';

  -- Clear any prior Joolies brief so re-runs stay clean
  DELETE FROM brief_sections WHERE client_id = jo;

  INSERT INTO brief_sections (client_id, title, content, sort_order) VALUES
  (jo, 'Brand Energy', $md$**THE VIBE**
• Sour candy addict meets wellness era
• "Gas station sour candy grew up"
• Poolside. Roadtrip. Movie night. Desk snack.
• Slightly unhinged in the best way
• Playful, not clinical
• Confident, not a "healthy lecture"

**KEY PHRASES TO REPEAT OFTEN**
• "Sour Not Sorry."
• "Nature's candy with a SOUR twist."
• "This is your candy era with better ingredients."
• "Soft. Chewy. Puckeringly sour."
• "People lose their minds when they realize it's a DATE."
• "No added sugar. Still wildly craveable."
• "Date-ing with benefits."
• "The future of dates is SOUR."
• "If a Sour Patch Kid and a Medjool date had a California summer baby…"
• "Real fruit with sour candy energy."$md$, 1),

  (jo, 'Brand Summary', $md$**WHAT IS JOOLIES?**
• Organic date brand making dates fun again
• Changing the date-ing game — reimagining what dates can be
• Made in California — family farm roots + modern snack vibes
• Bringing dates out of the baking aisle and grandma's pantry into modern snack culture

**WHAT MAKES JOOLIES DIFFERENT?**
• Dates are the FIRST ingredient
• No refined sugar, no artificial junk
• Real fruit texture — soft + chewy, not hard dried fruit
• Sour candy experience with actual nutritional value
• An unexpected flavor experience

**BIG AUDIENCE HOOK**
"Most people think dates are only for smoothies or charcuterie boards… then they try these and suddenly they're hiding the bag from their spouse."$md$, 2),

  (jo, 'Date Education (Without Being Boring)', $md$**FAST NUTRITION + EXPERIENCE SOUNDBITES**
• Dates naturally contain fiber (but they're not prunes that make you go)
• Naturally sweet like caramel — from fruit, no added sugar
• 5 clean organic ingredients, no sugar-alcohol weirdness
• Naturally gluten-free + vegan
• Low glycemic index — no sugar crashes
• Pit-free, still gooey and chewy like a fresh date should be
• More satisfying than traditional candy

**FUN WAYS TO SAY IT**
• "Your taste buds think candy. Your body thinks fruit."
• "This is what happens when fruit gets a personality."
• "We basically turned dates into snack goblin fuel."
• "They hit the sour craving AND the sweet craving."
• "No sugar-crash energy."
• "These actually keep you full for a minute."
• "You thought you knew dates — one bite and you'll never look at them the same."
• "Not your typical date — we like to keep things interesting 😏"

**KEEP IT NON-MEDICINAL**
Avoid: "gut health functional snack," "blood sugar optimized," "weight loss candy," disease claims, and clinical nutrition speak.
Instead: "Way more satisfying than regular sour candy." / "Real ingredients you can actually pronounce." / "You feel GOOD after eating them."$md$, 3),

  (jo, 'Flavor Talking Points', $md$**BLUE RASPBERRY**
Nostalgic slushie energy; blue tongue without the dye; the chaotic favorite.
• "This one tastes illegal."
• "The flavor that surprises people most."
• "If you grew up loving blue raspberry anything… good luck."
• "Sweet first, then the SOUR hits."
• Prompt: "Blue raspberry lovers, where you at? Rate your sour tolerance 1–10."

**PEACHY**
Gummy peach-ring vibes; juicy and nostalgic; the smoothest intro flavor.
• "This one converts people."
• "Tastes like a peach ring grew up and got organic."
• "Dangerously snackable."
• Prompt: "Peach rings were elite candy and I stand by that."

**WATERMELON**
Summer, poolside, refreshing sour hit — the easiest gateway flavor.
• "This one screams summer."
• "Watermelon sour candy people are VERY loyal."
• "Movie theater candy energy."
• "Disappears first in mixed bowls."
• Prompt: "Cold Date Sours straight from the fridge? Elite."

**CHERRY COLA**
Retro soda-shop; unexpected; the cult-favorite dark horse.
• "Tastes like vintage cherry cola candy."
• "This one has personality."
• "People either become obsessed instantly… or steal the whole bag."
• "The smell alone sends me."
• Prompt: "Cherry cola candy fans are a different breed."$md$, 4),

  (jo, 'Eating Occasions', $md$**GREAT USE CASES**
• When the munchies hit
• Road trips, movie nights, desk snacks
• Late-night sweet cravings
• Pool/beach snacks, hiking, mom snacks
• Candy replacement, freezer snack
• Post-workout sweet craving
• Charcuterie board wildcard

**STRONG TIKTOK LIVE PROMPTS**
• "Would you try these frozen?"
• "Who's eating these in the car before they even get home?"
• "What flavor are you grabbing first?"
• "Sweet or SOUR first?"
• "Who hides snacks from their family?"$md$, 5),

  (jo, 'Live Selling Moments', $md$**CONVERSION LINES**
• "This is your sign to upgrade your candy drawer."
• "Your sour candy addiction just got a glow up."
• "The texture is INSANE."
• "I dare you to eat just one."
• "If you love sour candy but hate feeling gross after…"
• "These are dangerously poppable."
• "Dates are fire right now — these seal the deal."
• "I was date-ing Joolies, now I'm in LOVE and committed."
• "Guaranteed to lead to a second date."
• "You'll find your match with this line-up."

**SAMPLING REACTIONS (GO DRAMATIC ON FIRST BITES)**
• Eye widening — "WAIT."
• "Why is this actually so good?"
• "Hold on…"
• "That texture though."
• "The sour hit is REAL."$md$, 6),

  (jo, 'Live Games & Engagement', $md$• Rate the Sour — hosts rate each flavor 1–10 on sourness
• Blind Flavor Guess — guess the flavor blindfolded
• Date Hater Conversion — "I thought I hated dates until…"
• Freezer Test — frozen vs room temp, live
• Would You Rather — "Peachy forever or Blue Raspberry forever?" / "Sour candy or chocolate?" / "Sweet first or sour first?"$md$, 7),

  (jo, 'Host Personalities', $md$**IDEAL HOSTS**
• Expressive, fast reactions
• Snack lovers and candy lovers
• Chaotic-best-friend energy
• "I can't stop eating these"

**LESS IDEAL**
• Overly polished wellness-influencer tone
• Stiff corporate talking
• Overly scripted delivery

The LIVE should feel like: "your funniest friend discovering the best gas station candy of all time… except it's made from dates."$md$, 8),

  (jo, 'Do''s & Don''ts', $md$**DO**
• Eat them on camera constantly; show texture close-ups
• Bite or pull them apart; show the coating
• Freeze them / live-test them
• Compare to nostalgic candy moments
• Use humor + disbelief; lean into "made from dates?!"
• Keep energy conversational
• Mention: organic, no added sugar, made in California, real fruit, naturally gluten-free, fiber

**DO SAY (SOURCING)**
• "Made in California" / "Crafted in California" / "California-made"
• "Inspired by sunny snack vibes"
• "Made with organic dates"

**DON'T SAY (SOURCING)**
• "California-grown" / "Grown in California" / "California-grown fruit" / "Only California dates"
• Sourcing may vary — keep it "made in," never "grown in."

**DON'T**
• Sound wellness-influencer preachy or over-explain dates
• Use clinical nutrition language or make medical claims
• Compare directly against competitors by name
• Overuse "healthy" or make it feel restrictive/diet-y

**AVOID THESE VIBES**
• "Mom snack substitute," "guilt-free," "cheat candy," "clean eating candy alternative"
• Anything shame-y around candy — instead: "These are just FUN."$md$, 9);
END $$;
