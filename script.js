document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('rainCanvas');
    const ctx = canvas.getContext('2d');

    let width = 0;
    let height = 0;

    const raindrops = [];
    const ripples = [];

    const CONFIG = {
        dropCount: 35,
        dropSpeed: { min: 4, max: 9 },
        dropLength: { min: 15, max: 35 },
        dropWidth: 1,
        surfaceY: 0.82,
        surfaceVariance: 0.18,
        rippleMaxRadius: 140,
        rippleDuration: 2,
        rippleRings: 3,
        rippleEllipseRatio: 0.35
    };

    function resizeCanvas() {
        width = canvas.width = window.innerWidth;
        height = canvas.height = window.innerHeight;
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    class Raindrop {
        constructor() {
            this.reset();
        }

        reset() {
            this.x = Math.random() * width;
            this.y = Math.random() * -height;
            this.speed = CONFIG.dropSpeed.min + Math.random() * (CONFIG.dropSpeed.max - CONFIG.dropSpeed.min);
            this.length = CONFIG.dropLength.min + Math.random() * (CONFIG.dropLength.max - CONFIG.dropLength.min);
            this.opacity = 0.12 + Math.random() * 0.22;
        }

        update() {
            this.y += this.speed;

            const surfaceLevel = height * CONFIG.surfaceY + Math.random() * (height * CONFIG.surfaceVariance);
            if (this.y >= surfaceLevel) {
                ripples.push(new Ripple(this.x, surfaceLevel));
                this.reset();
            }
        }

        draw() {
            ctx.beginPath();
            ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x, this.y + this.length);
            ctx.strokeStyle = `rgba(0, 0, 0, ${this.opacity})`;
            ctx.lineWidth = CONFIG.dropWidth;
            ctx.stroke();
        }
    }

    class Ripple {
        constructor(x, y) {
            this.x = x;
            this.y = y;
            this.progress = 0;
            this.active = true;
            this.maxRadius = CONFIG.rippleMaxRadius * (0.6 + Math.random() * 0.4);

            gsap.to(this, {
                progress: 1,
                duration: CONFIG.rippleDuration,
                ease: 'power2.out',
                onComplete: () => {
                    this.active = false;
                }
            });
        }

        draw() {
            if (!this.active) {
                return;
            }

            for (let i = 0; i < CONFIG.rippleRings; i += 1) {
                const ringDelay = i * 0.15;
                const ringProgress = Math.max(0, this.progress - ringDelay);

                if (ringProgress <= 0) {
                    continue;
                }

                const radius = ringProgress * this.maxRadius;
                const opacity = Math.max(0, (1 - ringProgress) * 0.24);

                ctx.beginPath();
                ctx.ellipse(this.x, this.y, radius, radius * CONFIG.rippleEllipseRatio, 0, 0, Math.PI * 2);
                ctx.strokeStyle = `rgba(0, 0, 0, ${opacity})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    for (let i = 0; i < CONFIG.dropCount; i += 1) {
        const drop = new Raindrop();
        drop.y = Math.random() * height;
        raindrops.push(drop);
    }

    function animateRain() {
        ctx.clearRect(0, 0, width, height);

        raindrops.forEach((drop) => {
            drop.update();
            drop.draw();
        });

        for (let i = ripples.length - 1; i >= 0; i -= 1) {
            ripples[i].draw();

            if (!ripples[i].active) {
                ripples.splice(i, 1);
            }
        }

        requestAnimationFrame(animateRain);
    }

    animateRain();

    const dots = document.querySelectorAll('.dot');
    const dotsTimeline = gsap.timeline({ repeat: -1 });

    dotsTimeline
        .to(dots[0], { opacity: 1, duration: 0.3 })
        .to(dots[1], { opacity: 1, duration: 0.3 })
        .to(dots[2], { opacity: 1, duration: 0.3 })
        .to(dots, { opacity: 0, duration: 0.3, delay: 0.5 });
    
});
