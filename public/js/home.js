document.addEventListener('DOMContentLoaded', function() {
    // Animation triggers for feature cards
    const animateOnScroll = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-in');
            }
        });
    }, { threshold: 0.1 });
    
    // Observe feature cards
    document.querySelectorAll('.feature-card').forEach(card => {
        animateOnScroll.observe(card);
    });
    
    // Parallax effect for hero graphic
    if (window.innerWidth > 768) {
        window.addEventListener('scroll', function() {
            const heroGraphic = document.querySelector('.hero-graphic');
            if (heroGraphic) {
                const scrolled = window.pageYOffset;
                heroGraphic.style.transform = `translateY(${scrolled * 0.1}px)`;
            }
        });
    }
    
    // Form validation enhancement
    const forms = document.querySelectorAll('form');
    forms.forEach(form => {
        form.addEventListener('submit', function(e) {
            const inputs = this.querySelectorAll('input[required]');
            let isValid = true;
            
            inputs.forEach(input => {
                if (!input.value.trim()) {
                    isValid = false;
                    input.classList.add('error');
                    const errorMsg = document.createElement('span');
                    errorMsg.className = 'error-message';
                    errorMsg.textContent = 'This field is required';
                    if (!input.nextElementSibling?.classList.contains('error-message')) {
                        input.parentNode.insertBefore(errorMsg, input.nextSibling);
                    }
                } else {
                    input.classList.remove('error');
                    if (input.nextElementSibling?.classList.contains('error-message')) {
                        input.nextElementSibling.remove();
                    }
                }
            });
            
            if (!isValid) {
                e.preventDefault();
            }
        });
    });
});