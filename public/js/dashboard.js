// Optimized dashboard.js with universal filter support and preserved overlays
document.addEventListener('DOMContentLoaded', function() {
  // Cache DOM elements for better performance
  const searchInput = document.getElementById('expression-search');
  const searchResults = document.getElementById('search-results');
  const expressionCards = document.querySelector('.expression-cards');
  const resultsContainer = document.getElementById('results-container');
  const filterUniversalsCheckbox = document.getElementById('filter-universals');
  
  // State management
  let isProcessingAction = false;
  let memberCountCache = new Map();
  let currentlyLoadingResults = false;
  let pendingResultsUpdate = null;
  let activeOverlay = null; // Track currently active overlay
  
  // Initialize page tracking
  window.currentPage = window.currentPage || 1;
  
  // 1. Search Functionality with debouncing
  let searchTimeout = null;
  searchInput?.addEventListener('input', function() {
    const query = this.value.trim();
    
    // Clear previous timeout
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }
    
    if (query.length < 2) {
      searchResults.innerHTML = '';
      searchResults.style.display = 'none';
      return;
    }
    
    // Set loading state
    searchResults.innerHTML = '<div class="search-loading">Searching...</div>';
    searchResults.style.display = 'block';
    
    // Debounce the search to prevent excessive requests
    searchTimeout = setTimeout(() => {
      fetch(`/api/expressions/search?q=${encodeURIComponent(query)}`)
        .then(res => res.json())
        .then(data => {
          searchResults.innerHTML = '';
          
          if (data.length === 0) {
            searchResults.innerHTML = '<div class="search-no-results">No matches found</div>';
            return;
          }
          
          data.forEach(expression => {
            const resultItem = document.createElement('div');
            resultItem.className = 'search-result-item';
            resultItem.textContent = expression.text;
            resultItem.setAttribute('data-id', expression.id);
            resultItem.setAttribute('data-text', expression.text);
            
            // Store the set value if available
            if (expression.set) {
              resultItem.setAttribute('data-set', expression.set);
            }
            
            resultItem.addEventListener('click', function() {
              const id = this.getAttribute('data-id');
              const text = this.getAttribute('data-text');
              const set = this.getAttribute('data-set'); // Get the set value
              
              // Check if it's one of the known universal expressions by text
              if (text === 'I am' || text === 'I\'ve registered with Intersubject') {
                addExpressionToExamination(id, text, 'universal');
              } else {
                addExpressionToExamination(id, text, set);
              }
              
              searchInput.value = '';
              searchResults.style.display = 'none';
            });
            
            searchResults.appendChild(resultItem);
          });
          
          searchResults.style.display = 'block';
        })
        .catch(err => {
          console.error('Search error:', err);
          searchResults.innerHTML = '<div class="search-error">Error searching. Please try again.</div>';
        });
    }, 300); // 300ms debounce
  });
  
  // Universal filter checkbox handler
  filterUniversalsCheckbox?.addEventListener('change', function() {
    // Update results with new filter setting
    updateResults();
  });
  
  // Helper function to add expression to examination
  function addExpressionToExamination(id, text, set) {
    // Check if already examining this expression
    const exists = Array.from(
      document.querySelectorAll('.expression-card')
    ).some(card => card.getAttribute('data-expression-id') === id);
    
    if (exists) return;
    
    // Special handling for known universal expressions
    if (text === 'I am' || text === 'I\'ve registered with Intersubject') {
      set = 'universal';
    }
    
    // Create badge HTML if set is present
    let badgeHtml = '';
    if (set === 'universal') {
      badgeHtml = '<span class="cohort-badge universal-badge">UNIVERSAL</span>';
    } else if (set) {
      badgeHtml = `<span class="cohort-badge ${set}-badge">${set.toUpperCase()}</span>`;
    }
    
    // Create and add expression card with loading state
    const card = document.createElement('div');
    card.className = 'expression-card loading';
    card.setAttribute('data-expression-id', id);
    card.setAttribute('data-section', `card-details-${id}`);
    card.setAttribute('data-set', set || ''); // Store the set value for future reference
    
    card.innerHTML = `
      <span class="card-text">${text}</span>
      <div class="expression-meta">
        ${badgeHtml}
        <span class="member-count">Loading...</span>
      </div>
      <button class="remove-expression">×</button>
    `;
    
    expressionCards.appendChild(card);
    
    // Update results with the new card
    updateResults();
  }
  
  // 2. Core Results Update Function - Optimized with filterUniversals option
  window.updateResults = function() {
    // If another update is already in progress, queue this one
    if (currentlyLoadingResults) {
      pendingResultsUpdate = true;
      return;
    }
    
    const expressionIds = Array.from(
      document.querySelectorAll('.expression-card')
    ).map(card => card.getAttribute('data-expression-id'));
    
    if (expressionIds.length === 0) {
      resultsContainer.innerHTML = `
        <div class="empty-results">
          <div class="no-results">No related expressions found</div>
          <p class="empty-tip">Try adding expressions to examine their relationships</p>
        </div>`;
      return;
    }
    
    // Save currently active overlay ID before updating
    const activeOverlayId = activeOverlay ? activeOverlay.id : null;
    
    // Show loading state in the results container
    if (!resultsContainer.querySelector('.results-loading')) {
      // Save the scroll position
      const scrollPos = window.scrollY;
      
      resultsContainer.innerHTML = `
        <div class="results-loading">
          <div class="loading-spinner"></div>
          <p>Finding related expressions...</p>
        </div>`;
      
      // Restore scroll position to prevent jump
      window.scrollTo(0, scrollPos);
    }
    
    // Set loading flag
    currentlyLoadingResults = true;
    
    // Get filter universals setting
    const filterUniversals = filterUniversalsCheckbox ? filterUniversalsCheckbox.checked : true;
    
    // Make a single request that combines both hydration and exploration
    fetch('/api/explore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        expressionIds,
        page: window.currentPage || 1,
        pageSize: 30,
        includeHydration: true, // Tell the server to include hydration data
        filterUniversals // Pass the filter setting
      })
    })
    .then(res => res.json())
    .then(data => {
      // First, handle the hydration data if available
      if (data.hydrationData && data.hydrationData.expressions) {
        const expressionMap = new Map(
          data.hydrationData.expressions.map(expr => [expr.id.toString(), expr])
        );
        
        // Update our member count cache
        data.hydrationData.expressions.forEach(expr => {
          memberCountCache.set(expr.id.toString(), expr.memberCount || 0);
        });
        
        // Update examination cards with accurate membership status
        document.querySelectorAll('.expression-card').forEach(card => {
          // Remove loading state
          card.classList.remove('loading');
          
          const id = card.getAttribute('data-expression-id');
          const expr = expressionMap.get(id);
          const text = card.querySelector('.card-text').textContent;
          
          // Special handling for known universal expressions
          let badgeHtml = '';
          let set = expr.set;
          
          // Override for known universal expressions
          if (text === 'I am' || text === 'I\'ve registered with Intersubject') {
            set = 'universal';
            badgeHtml = '<span class="cohort-badge universal-badge">UNIVERSAL</span>';
          } else if (set === 'universal') {
            badgeHtml = '<span class="cohort-badge universal-badge">UNIVERSAL</span>';
          } else if (set) {
            badgeHtml = `<span class="cohort-badge ${set}-badge">${set.toUpperCase()}</span>`;
          }
          
          // Update badge if needed
          const existingBadge = card.querySelector('.cohort-badge');
          const metaDiv = card.querySelector('.expression-meta');
          
          if (existingBadge) {
            existingBadge.remove();
          }
          
          if (badgeHtml && metaDiv) {
            metaDiv.insertAdjacentHTML('afterbegin', badgeHtml);
          }
          
          if (expr) {
            // Apply correct membership class
            if (expr.isUserMember) {
              card.classList.add('user-member');
            } else {
              card.classList.remove('user-member');
            }
            
            // Update member count
            const countElement = card.querySelector('.member-count');
            if (countElement) {
              countElement.textContent = `${expr.memberCount || 0} members`;
            }
            
            // Update or create overlay with accurate data
            let overlay = document.getElementById(`card-details-${id}`);
            const wasActive = overlay && overlay.classList.contains('active');
            
            if (!overlay) {
              overlay = document.createElement('div');
              overlay.className = 'overlay-form';
              overlay.id = `card-details-${id}`;
              document.body.appendChild(overlay);
            }
            
            // Override set for known universal expressions
            let overlayBadgeHtml = '';
            if (text === 'I am' || text === 'I\'ve registered with Intersubject') {
              overlayBadgeHtml = '<span class="cohort-badge universal-badge">UNIVERSAL</span> ';
            } else if (set === 'universal') {
              overlayBadgeHtml = '<span class="cohort-badge universal-badge">UNIVERSAL</span> ';
            } else if (set) {
              overlayBadgeHtml = `<span class="cohort-badge ${set}-badge">${set.toUpperCase()}</span> `;
            }
            
            // Use accurate data from server for the overlay
            overlay.innerHTML = `
              <div class="form-content">
                <h2>${expr.text}</h2>
                <p>${overlayBadgeHtml}${expr.memberCount || 0} members identify with this expression</p>
                <div class="overlay-actions">
                  ${expr.isUserMember ? 
                    `<button class="disidentify-btn" data-id="${id}" data-text="${expr.text}">Disidentify</button>` : 
                    `<button class="identify-btn" data-id="${id}" data-text="${expr.text}">Identify</button>`
                  }
                  <button class="remove-btn" data-id="${id}">Remove from examination</button>
                  <a href="/explore/${id}" class="explore-btn">Explore this cohort in a new dashboard</a>
                </div>
              </div>
            `;
            
            // Restore active state if it was active
            if (wasActive) {
              overlay.classList.add('active');
              activeOverlay = overlay;
            }
          }
        });
      }
      
      // Then, update the results HTML from the explore data
      if (data.html) {
        // Save scroll position
        const scrollPos = window.scrollY;
        
        resultsContainer.innerHTML = data.html;
        
        // Restore scroll position
        window.scrollTo(0, scrollPos);
      }
      
      // Reattach event listeners after DOM update
      window.attachOverlayListeners();
      
      // Restore active overlay if there was one
      if (activeOverlayId) {
        const overlayToRestore = document.getElementById(activeOverlayId);
        if (overlayToRestore) {
          overlayToRestore.classList.add('active');
          activeOverlay = overlayToRestore;
        }
      }
      
      // Update loading state
      currentlyLoadingResults = false;
      
      // If a pending update was requested while loading, process it now
      if (pendingResultsUpdate) {
        pendingResultsUpdate = false;
        setTimeout(updateResults, 50);
      }
    })
    .catch(err => {
      console.error('Update results error:', err);
      resultsContainer.innerHTML = '<div class="empty-results"><div class="no-results">Error loading results</div></div>';
      
      // Reset loading state
      currentlyLoadingResults = false;
    });
  };
  
  // 3. Event Listeners Attachment - Optimized to prevent duplicate listeners
  window.attachOverlayListeners = function() {
    // Remove all existing event listeners (for safety)
    document.body.removeEventListener('click', bodyClickHandler);
    document.body.addEventListener('click', bodyClickHandler);
    
    // Close overlay when clicking outside content
    document.querySelectorAll('.overlay-form').forEach(overlay => {
      overlay.addEventListener('click', function(event) {
        if (event.target === this) {
          activeOverlay = null;
          this.classList.remove('active');
        }
      });
    });
  };
  
  // Centralized event handler for most document clicks
  function bodyClickHandler(event) {
    // Card text click to open overlay
    const cardText = event.target.closest('.card-text');
    if (cardText && cardText.closest('.expression-card')) {
      const card = cardText.closest('.expression-card');
      const sectionId = card.getAttribute('data-section');
      if (sectionId) {
        const overlay = document.getElementById(sectionId);
        if (overlay) {
          activeOverlay = overlay;
          overlay.classList.add('active');
        }
      }
      return;
    }

    // Remove expression card button
    const removeBtn = event.target.closest('.remove-expression');
    if (removeBtn && removeBtn.closest('.expression-card')) {
      const card = removeBtn.closest('.expression-card');
      const id = card.getAttribute('data-expression-id');
      card.remove();
      
      // Also remove overlay if it exists
      const overlay = document.getElementById(`card-details-${id}`);
      if (overlay) {
        if (activeOverlay === overlay) {
          activeOverlay = null;
        }
        overlay.remove();
      }
      
      // Update results after removing
      updateResults();
      return;
    }
    
    // Open overlay from result item
    const resultItem = event.target.closest('.result-item');
    if (resultItem) {
      const sectionId = resultItem.getAttribute('data-section');
      if (sectionId) {
        const overlay = document.getElementById(sectionId);
        if (overlay) {
          activeOverlay = overlay;
          overlay.classList.add('active');
        }
      }
      return;
    }
    
    // Add to examination buttons in result overlays
    const addBtn = event.target.closest('.add-to-examination-btn');
    if (addBtn) {
      const id = addBtn.getAttribute('data-id');
      const text = addBtn.getAttribute('data-text');
      
      // Find set information from the overlay or result item
      let set = null;
      const overlay = addBtn.closest('.overlay-form');
      if (overlay) {
        const badge = overlay.querySelector('.cohort-badge');
        if (badge) {
          // Extract set name from badge class (e.g., "universal-badge" → "universal")
          const badgeClassMatch = badge.className.match(/(\w+)-badge/);
          if (badgeClassMatch && badgeClassMatch[1]) {
            set = badgeClassMatch[1];
          }
        }
      }
      
      // Special case for known universal expressions
      if (text === 'I am' || text === 'I\'ve registered with Intersubject') {
        set = 'universal';
      }
      
      // Check if already in examination
      const exists = Array.from(
        document.querySelectorAll('.expression-card')
      ).some(card => card.getAttribute('data-expression-id') === id);

      if (!exists) {
        // Pass the set value to addExpressionToExamination
        addExpressionToExamination(id, text, set);
        
        // Close the overlay
        const currentOverlay = addBtn.closest('.overlay-form');
        if (currentOverlay) {
          currentOverlay.classList.remove('active');
          activeOverlay = null;
        }
      } else {
        const currentOverlay = addBtn.closest('.overlay-form');
        if (currentOverlay) {
          currentOverlay.classList.remove('active');
          activeOverlay = null;
        }
      }
      return;
    }

    // Identify with expression buttons
    const identifyBtn = event.target.closest('.identify-btn');
    if (identifyBtn) {
      handleIdentifyClick(identifyBtn);
      return;
    }
    
    // Disidentify with expression buttons
    const disidentifyBtn = event.target.closest('.disidentify-btn');
    if (disidentifyBtn) {
      handleDisidentifyClick(disidentifyBtn);
      return;
    }

    // Remove from examination buttons in overlays
    const removeBtnOverlay = event.target.closest('.remove-btn');
    if (removeBtnOverlay) {
      const id = removeBtnOverlay.getAttribute('data-id');
      const card = document.querySelector(`.expression-card[data-expression-id="${id}"]`);
      if (card) {
        card.remove();
      }
      
      const currentOverlay = removeBtnOverlay.closest('.overlay-form');
      if (currentOverlay) {
        currentOverlay.classList.remove('active');
        activeOverlay = null;
      }
      
      updateResults();
      return;
    }
    
    // Pagination buttons
    const pageBtn = event.target.closest('.page-btn');
    if (pageBtn) {
      const page = parseInt(pageBtn.getAttribute('data-page'), 10);
      if (!isNaN(page)) {
        window.currentPage = page;
        updateResults();
      }
      return;
    }
  }

  // Handle identify button click
  function handleIdentifyClick(identifyBtn) {
    // Prevent rapid clicking causing race conditions
    if (isProcessingAction) return;
    isProcessingAction = true;

    const id = identifyBtn.getAttribute('data-id');
    
    // Remember which overlay is active
    const currentOverlay = identifyBtn.closest('.overlay-form');
    if (currentOverlay) {
      activeOverlay = currentOverlay;
    }
    
    // Cache the elements we need to update
    const currentButton = identifyBtn;
    const currentCard = document.querySelector(`.expression-card[data-expression-id="${id}"]`);
    const resultItem = document.querySelector(`.result-item[data-expression-id="${id}"]`);
    
    // Temporary visual feedback
    currentButton.disabled = true;
    currentButton.textContent = 'Identifying...';
    
    // Get the current count - FIXED VERSION
    let currentCount;
    if (memberCountCache.has(id)) {
      currentCount = memberCountCache.get(id);
    } else {
      // pull the initial value straight off the visible result-card
      const elem = document.querySelector(`.result-item[data-expression-id="${id}"] .member-count`);
      // parseInt will grab the leading number ("8 members" → 8)
      currentCount = elem ? parseInt(elem.textContent, 10) : 0;
      // cache it so subsequent clicks are fast
      memberCountCache.set(id, currentCount);
    }
    
    fetch('/api/expressions/identify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expressionId: id })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        console.error('Identification failed:', data.error);
        currentButton.disabled = false;
        currentButton.textContent = 'Identify';
        isProcessingAction = false;
        return;
      }
      
      // Update the count
      const newCount = currentCount + 1;
      memberCountCache.set(id, newCount);
      
      // Update all member count displays
      updateAllCountDisplays(id, newCount);
      
      // Update UI state to show membership
      if (currentCard) {
        currentCard.classList.add('user-member');
      }
      if (resultItem) {
        resultItem.classList.add('user-member');
      }
      
      // Update button state
      currentButton.textContent = 'Disidentify';
      currentButton.classList.remove('identify-btn');
      currentButton.classList.add('disidentify-btn');
      currentButton.disabled = false;
      
      // Schedule a resort after 3 seconds but keep overlay open
      setTimeout(() => {
        updateResults();
      }, 3000);
      
      // Release the lock after a short delay
      setTimeout(() => {
        isProcessingAction = false;
      }, 300);
    })
    .catch(err => {
      console.error('Identify error:', err);
      currentButton.disabled = false;
      currentButton.textContent = 'Identify';
      isProcessingAction = false;
    });
  }

  // Handle disidentify button click
  function handleDisidentifyClick(disidentifyBtn) {
    // Prevent rapid clicking causing race conditions
    if (isProcessingAction) return;
    isProcessingAction = true;

    const id = disidentifyBtn.getAttribute('data-id');
    
    // Remember which overlay is active
    const currentOverlay = disidentifyBtn.closest('.overlay-form');
    if (currentOverlay) {
      activeOverlay = currentOverlay;
    }
    
    // Cache the elements we need to update
    const currentButton = disidentifyBtn;
    const currentCard = document.querySelector(`.expression-card[data-expression-id="${id}"]`);
    const resultItem = document.querySelector(`.result-item[data-expression-id="${id}"]`);
    
    // Temporary visual feedback
    currentButton.disabled = true;
    currentButton.textContent = 'Disidentifying...';
    
    // Get the current count - FIXED VERSION
    let currentCount;
    if (memberCountCache.has(id)) {
      currentCount = memberCountCache.get(id);
    } else {
      // pull the initial value straight off the visible result-card
      const elem = document.querySelector(`.result-item[data-expression-id="${id}"] .member-count`);
      // parseInt will grab the leading number ("8 members" → 8)
      currentCount = elem ? parseInt(elem.textContent, 10) : 0;
      // cache it so subsequent clicks are fast
      memberCountCache.set(id, currentCount);
    }
    
    fetch('/api/expressions/disidentify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expressionId: id })
    })
    .then(res => res.json())
    .then(data => {
      if (!data.success) {
        console.error('Disidentification failed:', data.error);
        currentButton.disabled = false;
        currentButton.textContent = 'Disidentify';
        isProcessingAction = false;
        return;
      }
      
      // Update the count
      const newCount = Math.max(0, currentCount - 1);
      memberCountCache.set(id, newCount);
      
      // Update all member count displays
      updateAllCountDisplays(id, newCount);
      
      // Update UI state to show no membership
      if (currentCard) {
        currentCard.classList.remove('user-member');
      }
      if (resultItem) {
        resultItem.classList.remove('user-member');
      }
      
      // Update button state
      currentButton.textContent = 'Identify';
      currentButton.classList.remove('disidentify-btn');
      currentButton.classList.add('identify-btn');
      currentButton.disabled = false;
      
      // Schedule a resort after 3 seconds but keep overlay open
      setTimeout(() => {
        updateResults();
      }, 3000);
      
      // Release the lock after a short delay
      setTimeout(() => {
        isProcessingAction = false;
      }, 300);
    })
    .catch(err => {
      console.error('Disidentify error:', err);
      currentButton.disabled = false;
      currentButton.textContent = 'Disidentify';
      isProcessingAction = false;
    });
  }
  
  // Completely rewritten count update function
  function updateAllCountDisplays(id, count) {
    // 1. Update card details overlay
    const cardOverlay = document.getElementById(`card-details-${id}`);
    if (cardOverlay) {
      const countParagraph = cardOverlay.querySelector('p');
      if (countParagraph) {
        // Preserve the badge if it exists
        const badge = countParagraph.querySelector('.cohort-badge');
        const badgeHtml = badge ? badge.outerHTML + ' ' : '';
        countParagraph.innerHTML = `${badgeHtml}${count} members identify with this expression`;
      }
    }
    
    // 2. Update expression details overlay
    const expressionOverlay = document.getElementById(`expression-details-${id}`);
    if (expressionOverlay) {
      const countParagraph = expressionOverlay.querySelector('p');
      if (countParagraph) {
        // We need to preserve any special elements like badges
        let newContent = '';
        
        // Check for universal badge
        const badge = countParagraph.querySelector('.cohort-badge');
        if (badge) {
          newContent += badge.outerHTML + ' ';
        }
        
        // Add the count text
        newContent += `${count} members identify with this expression`;
        
        // Check for overlap percentage info
        const overlapDetail = countParagraph.querySelector('.overlap-detail');
        if (overlapDetail) {
          newContent += ' ' + overlapDetail.outerHTML;
        }
        
        countParagraph.innerHTML = newContent;
      }
    }
    
    // 3. Update card in examination bar
    const card = document.querySelector(`.expression-card[data-expression-id="${id}"]`);
    if (card) {
      const memberCount = card.querySelector('.member-count');
      if (memberCount) {
        memberCount.textContent = `${count} members`;
      }
    }
    
    // 4. Update result item
    const resultItem = document.querySelector(`.result-item[data-expression-id="${id}"]`);
    if (resultItem) {
      const memberCount = resultItem.querySelector('.member-count');
      if (memberCount) {
        memberCount.textContent = `${count} members`;
      }
    }
  }
  
  // Hide search dropdown when clicking outside
  document.addEventListener('click', function(e) {
    if (!searchInput?.contains(e.target) && !searchResults?.contains(e.target)) {
      searchResults.style.display = 'none';
    }
  });
  
  // Close overlays with Escape key
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.overlay-form.active').forEach(overlay => {
        overlay.classList.remove('active');
        activeOverlay = null;
      });
    }
  });
  
  // Initial setup
  window.attachOverlayListeners();
  if (document.querySelectorAll('.expression-card').length > 0) {
    updateResults();
  }
});