// YouTube AI Video Detector - Content Script

class AIVideoDetector {
    constructor() {
        this.currentVideoId = null;
        this.votingPanel = null;
        this.init();
    }

    init() {
        // Wait for page to load and check for video changes
        this.waitForYouTubeLoad();
        
        // Listen for navigation changes (YouTube is a SPA)
        let lastUrl = location.href;
        new MutationObserver(() => {
            const url = location.href;
            if (url !== lastUrl) {
                lastUrl = url;
                setTimeout(() => this.handlePageChange(), 1000);
            }
        }).observe(document, { subtree: true, childList: true });
    }

    waitForYouTubeLoad() {
        const checkForVideo = () => {
            if (this.isWatchPage() && document.querySelector('#movie_player')) {
                this.handlePageChange();
            } else {
                setTimeout(checkForVideo, 500);
            }
        };
        checkForVideo();
    }

    isWatchPage() {
        return window.location.pathname === '/watch';
    }

    getVideoId() {
        const urlParams = new URLSearchParams(window.location.search);
        return urlParams.get('v');
    }

    handlePageChange() {
        if (!this.isWatchPage()) {
            this.removeVotingPanel();
            return;
        }

        const videoId = this.getVideoId();
        if (videoId !== this.currentVideoId) {
            this.currentVideoId = videoId;
            this.removeVotingPanel();
            this.createVotingPanel();
        }
    }

    async createVotingPanel() {
        // Find the target container (below video, above description)
        const targetContainer = this.findTargetContainer();
        if (!targetContainer) {
            console.log('Could not find target container, retrying...');
            setTimeout(() => this.createVotingPanel(), 1000);
            return;
        }

        // Create the voting panel
        this.votingPanel = document.createElement('div');
        this.votingPanel.id = 'ai-detector-panel';
        this.votingPanel.className = 'ai-detector-panel';

        // Get existing votes for this video
        const voteData = await this.getVoteData(this.currentVideoId);
        
        this.votingPanel.innerHTML = `
            <div class="ai-detector-header">
                <h3>🤖 AI Content Detection</h3>
                <div class="ai-detector-stats">
                    <span class="vote-count">${voteData.totalVotes} votes</span>
                </div>
            </div>
            
            <div class="ai-detector-content">
                <div class="vote-display">
                    <div class="vote-bar">
                        <div class="ai-bar" style="width: ${voteData.aiPercentage}%"></div>
                        <div class="human-bar" style="width: ${voteData.humanPercentage}%"></div>
                    </div>
                    <div class="vote-labels">
                        <span class="ai-label">AI: ${voteData.aiVotes} (${voteData.aiPercentage}%)</span>
                        <span class="human-label">Human: ${voteData.humanVotes} (${voteData.humanPercentage}%)</span>
                    </div>
                </div>
                
                <div class="voting-buttons">
                    <button class="vote-btn ai-btn" data-vote="ai">
                        🤖 Vote AI Generated
                    </button>
                    <button class="vote-btn human-btn" data-vote="human">
                        👨‍💻 Vote Human Made
                    </button>
                </div>
                
                <div class="user-vote-status"></div>
            </div>
        `;

        // Insert the panel
        targetContainer.insertBefore(this.votingPanel, targetContainer.firstChild);

        // Add event listeners
        this.setupEventListeners();
        
        // Update UI based on user's previous vote
        this.updateUserVoteStatus();
    }

    findTargetContainer() {
        // Try multiple selectors to find the right container
        const selectors = [
            '#primary-inner',
            '#columns #primary',
            'ytd-watch-flexy[role="main"] #columns #primary'
        ];

        for (const selector of selectors) {
            const container = document.querySelector(selector);
            if (container) {
                return container;
            }
        }
        return null;
    }

    setupEventListeners() {
        const buttons = this.votingPanel.querySelectorAll('.vote-btn');
        buttons.forEach(button => {
            button.addEventListener('click', (e) => {
                const voteType = e.target.getAttribute('data-vote');
                this.submitVote(voteType);
            });
        });
    }

    async submitVote(voteType) {
        try {
            // Store vote locally (in a real app, you'd send to your backend)
            await this.storeVote(this.currentVideoId, voteType);
            
            // Update the display
            const voteData = await this.getVoteData(this.currentVideoId);
            this.updateVoteDisplay(voteData);
            this.updateUserVoteStatus();
            
            // Show feedback
            this.showVoteFeedback(voteType);
            
        } catch (error) {
            console.error('Error submitting vote:', error);
            this.showError('Failed to submit vote. Please try again.');
        }
    }

    async storeVote(videoId, voteType) {
        return new Promise((resolve) => {
            chrome.storage.local.get([videoId, 'userVotes'], (result) => {
                const videoData = result[videoId] || { ai: 0, human: 0 };
                const userVotes = result.userVotes || {};
                
                // Remove previous vote if exists
                const previousVote = userVotes[videoId];
                if (previousVote) {
                    videoData[previousVote]--;
                }
                
                // Add new vote
                videoData[voteType]++;
                userVotes[videoId] = voteType;
                
                // Save back to storage
                const toSave = {};
                toSave[videoId] = videoData;
                toSave.userVotes = userVotes;
                
                chrome.storage.local.set(toSave, resolve);
            });
        });
    }

    async getVoteData(videoId) {
        return new Promise((resolve) => {
            chrome.storage.local.get([videoId], (result) => {
                const data = result[videoId] || { ai: 0, human: 0 };
                const totalVotes = data.ai + data.human;
                
                const aiPercentage = totalVotes > 0 ? Math.round((data.ai / totalVotes) * 100) : 0;
                const humanPercentage = totalVotes > 0 ? Math.round((data.human / totalVotes) * 100) : 0;
                
                resolve({
                    aiVotes: data.ai,
                    humanVotes: data.human,
                    totalVotes: totalVotes,
                    aiPercentage: aiPercentage,
                    humanPercentage: humanPercentage
                });
            });
        });
    }

    updateVoteDisplay(voteData) {
        const aiBar = this.votingPanel.querySelector('.ai-bar');
        const humanBar = this.votingPanel.querySelector('.human-bar');
        const aiLabel = this.votingPanel.querySelector('.ai-label');
        const humanLabel = this.votingPanel.querySelector('.human-label');
        const voteCount = this.votingPanel.querySelector('.vote-count');
        
        if (aiBar) aiBar.style.width = `${voteData.aiPercentage}%`;
        if (humanBar) humanBar.style.width = `${voteData.humanPercentage}%`;
        if (aiLabel) aiLabel.textContent = `AI: ${voteData.aiVotes} (${voteData.aiPercentage}%)`;
        if (humanLabel) humanLabel.textContent = `Human: ${voteData.humanVotes} (${voteData.humanPercentage}%)`;
        if (voteCount) voteCount.textContent = `${voteData.totalVotes} votes`;
    }

    async updateUserVoteStatus() {
        chrome.storage.local.get(['userVotes'], (result) => {
            const userVotes = result.userVotes || {};
            const userVote = userVotes[this.currentVideoId];
            const statusEl = this.votingPanel.querySelector('.user-vote-status');
            
            if (userVote) {
                statusEl.innerHTML = `<span class="user-voted">You voted: ${userVote === 'ai' ? '🤖 AI Generated' : '👨‍💻 Human Made'}</span>`;
                
                // Highlight the voted button
                this.votingPanel.querySelectorAll('.vote-btn').forEach(btn => {
                    btn.classList.remove('voted');
                });
                this.votingPanel.querySelector(`[data-vote="${userVote}"]`).classList.add('voted');
            } else {
                statusEl.innerHTML = '<span class="not-voted">Cast your vote above!</span>';
            }
        });
    }

    showVoteFeedback(voteType) {
        const statusEl = this.votingPanel.querySelector('.user-vote-status');
        statusEl.innerHTML = `<span class="vote-success">✅ Vote submitted: ${voteType === 'ai' ? 'AI Generated' : 'Human Made'}</span>`;
        
        setTimeout(() => {
            this.updateUserVoteStatus();
        }, 2000);
    }

    showError(message) {
        const statusEl = this.votingPanel.querySelector('.user-vote-status');
        statusEl.innerHTML = `<span class="vote-error">❌ ${message}</span>`;
        
        setTimeout(() => {
            this.updateUserVoteStatus();
        }, 3000);
    }

    removeVotingPanel() {
        if (this.votingPanel) {
            this.votingPanel.remove();
            this.votingPanel = null;
        }
    }
}

// Initialize the detector when the script loads
const detector = new AIVideoDetector();