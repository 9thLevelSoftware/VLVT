/**
 * VLVT Website Animations
 * - AOS (Animate On Scroll) initialization
 * - particles.js gold sparkles configuration
 * - Navigation scroll behavior
 */

// Wait for DOM to be ready
document.addEventListener('DOMContentLoaded', function() {
  // Initialize AOS
  initAOS();

  // Initialize particles.js for gold sparkles
  initParticles();

  // Initialize navbar scroll behavior
  initNavbar();
});

/**
 * Initialize AOS (Animate On Scroll)
 */
function initAOS() {
  AOS.init({
    duration: 800,
    easing: 'ease-out-cubic',
    once: true,
    offset: 50,
    disable: function() {
      // Disable on very slow connections or if user prefers reduced motion
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  });
}

/**
 * Initialize particles.js with gold sparkle configuration
 */
function initParticles() {
  if (typeof particlesJS === 'undefined') {
    console.warn('particles.js not loaded');
    return;
  }

  particlesJS('particles-js', {
    particles: {
      number: {
        value: 50,
        density: {
          enable: true,
          value_area: 1000
        }
      },
      color: {
        value: ['#D4AF37', '#F2D26D', '#FFD700']
      },
      shape: {
        type: 'circle'
      },
      opacity: {
        value: 0.6,
        random: true,
        anim: {
          enable: true,
          speed: 0.5,
          opacity_min: 0.1,
          sync: false
        }
      },
      size: {
        value: 3,
        random: true,
        anim: {
          enable: true,
          speed: 2,
          size_min: 0.5,
          sync: false
        }
      },
      line_linked: {
        enable: false
      },
      move: {
        enable: true,
        speed: 0.8,
        direction: 'none',
        random: true,
        straight: false,
        out_mode: 'out',
        bounce: false,
        attract: {
          enable: true,
          rotateX: 600,
          rotateY: 1200
        }
      }
    },
    interactivity: {
      detect_on: 'canvas',
      events: {
        onhover: {
          enable: true,
          mode: 'bubble'
        },
        onclick: {
          enable: true,
          mode: 'push'
        },
        resize: true
      },
      modes: {
        bubble: {
          distance: 150,
          size: 5,
          duration: 2,
          opacity: 0.8,
          speed: 3
        },
        push: {
          particles_nb: 3
        }
      }
    },
    retina_detect: true
  });
}

/**
 * Initialize navbar scroll behavior
 * - Add 'scrolled' class when scrolling down
 * - Hide on scroll down, show on scroll up (optional enhancement)
 */
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  let lastScrollY = window.scrollY;
  let ticking = false;

  function updateNavbar() {
    const currentScrollY = window.scrollY;

    // Add/remove scrolled class based on scroll position
    if (currentScrollY > 50) {
      navbar.classList.add('scrolled');
    } else {
      navbar.classList.remove('scrolled');
    }

    lastScrollY = currentScrollY;
    ticking = false;
  }

  window.addEventListener('scroll', function() {
    if (!ticking) {
      window.requestAnimationFrame(updateNavbar);
      ticking = true;
    }
  }, { passive: true });
}

/**
 * Smooth scroll for anchor links
 */
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href === '#') return;

    const target = document.querySelector(href);
    if (target) {
      e.preventDefault();
      target.scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });
    }
  });
});
