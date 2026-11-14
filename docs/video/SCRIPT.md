# Loyal Cart demo: narration script

Voice-over: `docs/video/loyal-cart-voiceover.mp3` (Mansi, 122.5 s, mono MP3 48 kHz).

This is the script Mansi read from. **The recording is the source of truth for subtitles:** where her spoken words differ from this text, the subtitles follow the audio.

Paragraph start times are approximate (±1 s), found from pauses in the recording. Use them to block out scenes, and align the subtitles to the audio itself.

## P1 · ~0.5s → ~14.9s

We asked an AI shopping agent to buy the best offer for an item. One seller hid an instruction in their listing telling the agent to pick them, and a seven-billion-parameter model followed it nineteen times out of twenty.

## P2 · ~14.9s → ~25.7s

That's the risk with agents that spend money: whoever can reach the agent can quietly change who gets paid, and afterwards you can't tell whose side it was on.

## P3 · ~25.7s → ~47.7s

Loyal Cart moves that decision somewhere the agent can't bend. The buyer first commits to what "best" means: how much price, delivery time and the seller's track record matter. Sellers post offers in a public book on chain, and at checkout the contract picks the winner itself. If the agent tries to pay anyone else, the payment is refused.

## P4 · ~47.7s → ~62.9s

On this page you can try to corrupt it. Here a five-NEAR kickback is simulated, and the winner doesn't move. A seller who genuinely drops their price, on the other hand, does win, which is how it should be.

## P5 · ~62.9s → ~84.4s

Best doesn't always mean cheapest, either. In this quote on testnet, the cheapest offer takes a hundred and twenty days to arrive. The buyer had said delivery matters, so the contract paid the one-day offer instead. The sliders let you see where that choice would flip, but what happened on chain followed the buyer's original policy.

## P6 · ~84.4s → ~97.1s

Then we let a real model do the shopping on testnet. Three times it was steered towards the wrong seller, and three times the contract refused to pay. The one time it chose honestly, the payment went through.

## P7 · ~97.1s → ~110.3s

Every refusal on this page is a real testnet transaction, fourteen kinds of them, and anyone can re-check the policy, the offers, the winner and every receipt straight from the chain, without a key or an account.

## P8 · ~110.3s → ~122.5s

So the agent can still be fooled. It just doesn't get to decide who gets paid anymore. The code and all the evidence are on GitHub, at mansi0xc slash loyal-cart.
