// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title MantleWrapped
 * @notice Soulbound NFT for Mantle Wrapped Season 1.
 * Each wallet mints once. Non-transferable. AI-generated trait stored on-chain.
 * Deployed on Mantle Mainnet: 0xfaB1E40725b4411113C8D7614E4f774f5AFe08EC
 */
contract MantleWrapped {

    // ─── ERRORS ───
    error AlreadyMinted();
    error TransferNotAllowed();
    error NotOwner();
    error TokenDoesNotExist();
    error EmptyIPFSHash();
    error EmptyTrait();

    // ─── EVENTS ───
    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event WrappedMinted(address indexed wallet, uint256 indexed tokenId, string trait);

    // ─── STORAGE ───
    string public name = "Mantle Wrapped";
    string public symbol = "MWRP";

    address public owner;
    uint256 private _tokenIdCounter;

    // tokenId → owner
    mapping(uint256 => address) private _owners;

    // wallet → tokenId (0 = not minted)
    mapping(address => uint256) private _walletToken;

    // tokenId → IPFS hash
    mapping(uint256 => string) private _tokenIPFS;

    // tokenId → AI trait
    mapping(uint256 => string) private _tokenTrait;

    // ─── CONSTRUCTOR ───
    constructor() {
        owner = msg.sender;
        _tokenIdCounter = 1;
    }

    // ─── MODIFIERS ───
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    // ─── MINT ───
    function mintWrapped(string calldata ipfsHash, string calldata trait) external {
        if (_walletToken[msg.sender] != 0) revert AlreadyMinted();
        if (bytes(ipfsHash).length == 0) revert EmptyIPFSHash();
        if (bytes(trait).length == 0) revert EmptyTrait();

        uint256 tokenId = _tokenIdCounter;
        _tokenIdCounter++;

        _owners[tokenId] = msg.sender;
        _walletToken[msg.sender] = tokenId;
        _tokenIPFS[tokenId] = ipfsHash;
        _tokenTrait[tokenId] = trait;

        emit Transfer(address(0), msg.sender, tokenId);
        emit WrappedMinted(msg.sender, tokenId, trait);
    }

    // ─── SOULBOUND — BLOCK ALL TRANSFERS ───
    function transferFrom(address, address, uint256) external pure {
        revert TransferNotAllowed();
    }

    function safeTransferFrom(address, address, uint256) external pure {
        revert TransferNotAllowed();
    }

    function safeTransferFrom(address, address, uint256, bytes calldata) external pure {
        revert TransferNotAllowed();
    }

    function approve(address, uint256) external pure {
        revert TransferNotAllowed();
    }

    function setApprovalForAll(address, bool) external pure {
        revert TransferNotAllowed();
    }

    // ─── READ FUNCTIONS ───
    function ownerOf(uint256 tokenId) external view returns (address) {
        address tokenOwner = _owners[tokenId];
        if (tokenOwner == address(0)) revert TokenDoesNotExist();
        return tokenOwner;
    }

    function tokenOf(address wallet) external view returns (uint256) {
        return _walletToken[wallet];
    }

    function hasMinted(address wallet) external view returns (bool) {
        return _walletToken[wallet] != 0;
    }

    function tokenURI(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return string(abi.encodePacked("ipfs://", _tokenIPFS[tokenId]));
    }

    function traitOf(uint256 tokenId) external view returns (string memory) {
        if (_owners[tokenId] == address(0)) revert TokenDoesNotExist();
        return _tokenTrait[tokenId];
    }

    function totalSupply() external view returns (uint256) {
        return _tokenIdCounter - 1;
    }

    function balanceOf(address wallet) external view returns (uint256) {
        return _walletToken[wallet] != 0 ? 1 : 0;
    }

    function getApproved(uint256) external pure returns (address) {
        return address(0);
    }

    function isApprovedForAll(address, address) external pure returns (bool) {
        return false;
    }

    function supportsInterface(bytes4 interfaceId) external pure returns (bool) {
        return
            interfaceId == 0x80ac58cd || // ERC721
            interfaceId == 0x5b5e139f || // ERC721Metadata
            interfaceId == 0x01ffc9a7;   // ERC165
    }
}
