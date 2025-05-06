// public/js/auth.js// public/js/auth.js


document.addEventListener('DOMContentLoaded', function () {
    // Handle all clickable elements that can trigger overlays
    document.body.addEventListener('click', function(event) {
        // Check if clicked element or its parent has data-section attribute
        let target = event.target;
        let sectionId = null;
        
        // Look for data-section in the element or its parents (up to 3 levels)
        for (let i = 0; i < 3; i++) {
            if (!target) break;
            if (target.hasAttribute('data-section')) {
                sectionId = target.getAttribute('data-section');
                break;
            }
            target = target.parentElement;
        }
        
        // If we found a data-section, show the corresponding overlay
        if (sectionId) {
            event.preventDefault();
            const overlay = document.getElementById(sectionId);
            if (overlay) {
                // Close ALL active overlays (including overlay-form class)
                document.querySelectorAll('.overlay.active, .overlay-form.active').forEach(active => {
                    active.classList.remove('active');
                });
                overlay.classList.add('active');
            }
        }
    });

    // Close overlay when clicking outside the content
    const overlays = document.querySelectorAll('.overlay, .overlay-form');
    overlays.forEach(overlay => {
        overlay.addEventListener('click', event => {
            if (event.target === overlay) {
                overlay.classList.remove('active');
            }
        });
    });

    // Handle Escape key
    document.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            overlays.forEach(overlay => overlay.classList.remove('active'));
        }
    });
});