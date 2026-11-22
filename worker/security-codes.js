// Unbiased six-digit codes, including leading zeroes.
export function sixDigitCode(){const sample=new Uint32Array(1);do{crypto.getRandomValues(sample)}while(sample[0]>=4294000000);return String(sample[0]%1000000).padStart(6,'0')}
