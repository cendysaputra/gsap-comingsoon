// GSAP Animations for Coming Soon Page

document.addEventListener('DOMContentLoaded', () => {
    
    // Noise Background
    const canvas = document.getElementById('noise');
    const ctx = canvas.getContext('2d');
    
    // Set canvas size
    function resizeCanvas() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Generate noise
    function generateNoise() {
        const imageData = ctx.createImageData(canvas.width, canvas.height);
        const data = imageData.data;
        
        for (let i = 0; i < data.length; i += 4) {
            const value = Math.random() * 255;
            data[i] = value;     // R
            data[i + 1] = value; // G
            data[i + 2] = value; // B
            data[i + 3] = 255;   // A
        }
        
        ctx.putImageData(imageData, 0, 0);
    }
    
    // Animate noise with GSAP
    function animateNoise() {
        generateNoise();
    }
    
    // Use GSAP ticker for smooth animation
    gsap.ticker.add(animateNoise);
    
    // Dots typing animation
    const dots = document.querySelectorAll('.dot');
    
    const dotsTimeline = gsap.timeline({ repeat: -1 });
    
    dotsTimeline
        .to(dots[0], { opacity: 1, duration: 0.3 })
        .to(dots[1], { opacity: 1, duration: 0.3 })
        .to(dots[2], { opacity: 1, duration: 0.3 })
        .to(dots, { opacity: 0, duration: 0.3, delay: 0.5 });
    
});
