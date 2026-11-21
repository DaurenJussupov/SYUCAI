export const promotionRates={1:500,2:900,3:1200};
export const promotionBasePrice=days=>promotionRates[days]??null;
